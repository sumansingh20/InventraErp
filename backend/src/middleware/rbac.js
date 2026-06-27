'use strict';

/**
 * RBAC Middleware
 * A convenience wrapper for role-based access control.
 * Delegates to the existing `authorize` function in auth middleware.
 */
const { authorize } = require('./auth');
const { AppError } = require('./errorHandler');

/**
 * requireRole(...roles) - requires user to have one of the listed roles
 */
const requireRole = (...roles) => {
  // Support both requireRole(['admin', 'owner']) and requireRole('admin', 'owner')
  const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;
  return authorize(...allowedRoles);
};

/**
 * requireSuperAdmin - only super admins can access
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return next(new AppError('Super admin privileges required.', 403));
  }
  next();
};

/**
 * requireOwnerOrAdmin - company_owner or admin role
 */
const requireOwnerOrAdmin = requireRole(['company_owner', 'admin']);

module.exports = { requireRole, requireSuperAdmin, requireOwnerOrAdmin };
