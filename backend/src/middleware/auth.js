'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const logger = require('../config/logger');
const { AuditLog } = require('../models/Notification');
const crypto = require('crypto');

// ─── Authenticate JWT ──────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Your session has expired. Please log in again.', 401));
      }
      return next(new AppError('Invalid authentication token.', 401));
    }
    
    // Get user
    const user = await User.findById(decoded.id)
      .select('+twoFactorEnabled +twoFactorSecret')
      .populate('role')
      .lean();
    
    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }
    
    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }
    
    if (user.isLocked) {
      return next(new AppError('Your account is temporarily locked due to multiple failed login attempts.', 403));
    }
    
    // Check if password was changed after token was issued
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return next(new AppError('Password was recently changed. Please log in again.', 401));
      }
    }
    
    req.user = user;
    req.companyId = req.headers['x-company-id'] || user.company?.toString();
    req.branchId = req.headers['x-branch-id'] || user.branch?.toString();
    
    next();
  } catch (err) {
    next(err);
  }
};

// ─── Optional Auth (for public endpoints with optional user context) ────────────
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).populate('role').lean();
        if (user && user.isActive) {
          req.user = user;
        }
      } catch {
        // Silently ignore invalid tokens for optional auth
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

// ─── Authorize: Super Admin only ──────────────────────────────────────────────
const isSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return next(new AppError('Access denied. Super admin privileges required.', 403));
  }
  next();
};

// ─── Authorize: Role-Based ────────────────────────────────────────────────────
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }
    
    if (req.user.isSuperAdmin) return next(); // Super admin bypasses all
    
    const userRoleSlug = req.user.role?.slug || req.user.customRole;
    
    if (!allowedRoles.includes(userRoleSlug)) {
      return next(new AppError(`Access denied. Required role: ${allowedRoles.join(' or ')}`, 403));
    }
    next();
  };
};

// ─── Authorize: Module + Action Permission ────────────────────────────────────
const hasPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required.', 401));
      }
      
      // Super admin has all permissions
      if (req.user.isSuperAdmin) return next();
      
      // Check role permissions
      const rolePermissions = req.user.role?.permissions || [];
      const modulePermission = rolePermissions.find(p => p.module === module);
      
      if (!modulePermission || !modulePermission.actions[action]) {
        // Check user-level overrides
        const userPermissions = req.user.permissions || [];
        const userModulePerm = userPermissions.find(p => p.module === module);
        
        if (!userModulePerm || !userModulePerm.actions.includes(action)) {
          return next(new AppError(`Permission denied: ${action} on ${module}`, 403));
        }
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
};

// ─── Verify same company ───────────────────────────────────────────────────────
const sameCompany = (req, res, next) => {
  if (req.user.isSuperAdmin) return next();
  
  const requestedCompany = req.params.companyId || req.query.company || req.body.company;
  
  if (requestedCompany && requestedCompany !== req.user.company?.toString()) {
    return next(new AppError('Access denied. You can only access your own company data.', 403));
  }
  next();
};

// ─── Audit Logger Middleware ───────────────────────────────────────────────────
const auditLog = (action, module, getEntityInfo) => {
  return async (req, res, next) => {
    // Capture original json method
    const originalJson = res.json.bind(res);
    
    res.json = async function(data) {
      // Log after response
      try {
        if (req.user && res.statusCode < 400) {
          const entityInfo = getEntityInfo ? getEntityInfo(req, data) : {};
          
          const log = new AuditLog({
            company: req.companyId,
            user: req.user._id,
            userName: req.user.name,
            userEmail: req.user.email,
            userRole: req.user.role?.slug,
            action,
            module,
            entity: entityInfo.entity,
            entityId: entityInfo.id,
            entityName: entityInfo.name,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            success: true,
            checksum: crypto.createHash('sha256')
              .update(`${Date.now()}-${req.user._id}-${action}-${module}`)
              .digest('hex')
          });
          
          await log.save().catch(e => logger.error('Audit log save error:', e));
        }
      } catch (e) {
        logger.error('Audit middleware error:', e);
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  isSuperAdmin,
  authorize,
  hasPermission,
  sameCompany,
  auditLog
};
