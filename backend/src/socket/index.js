'use strict';

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

let io = null;

// Map of companyId -> Set of socket IDs
const companyRooms = new Map();
// Map of userId -> socket ID
const userSockets = new Map();

const setupSocketIO = (server) => {
  io = socketIO(server, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const User = require('../models/User');
      const user = await User.findById(decoded.id).select('name company isSuperAdmin isActive').lean();
      
      if (!user || !user.isActive) {
        return next(new Error('Unauthorized'));
      }
      
      socket.userId = user._id.toString();
      socket.companyId = user.company?.toString();
      socket.userName = user.name;
      socket.isSuperAdmin = user.isSuperAdmin;
      
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });
  
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} | User: ${socket.userName} | Company: ${socket.companyId}`);
    
    // Join company room
    if (socket.companyId) {
      socket.join(`company:${socket.companyId}`);
      
      if (!companyRooms.has(socket.companyId)) {
        companyRooms.set(socket.companyId, new Set());
      }
      companyRooms.get(socket.companyId).add(socket.id);
    }
    
    // Join user room
    socket.join(`user:${socket.userId}`);
    userSockets.set(socket.userId, socket.id);
    
    // Super admin joins global room
    if (socket.isSuperAdmin) {
      socket.join('super-admin');
    }
    
    // Emit online status
    if (socket.companyId) {
      socket.to(`company:${socket.companyId}`).emit('user:online', {
        userId: socket.userId,
        userName: socket.userName
      });
    }
    
    // Join warehouse room
    socket.on('join:warehouse', (warehouseId) => {
      socket.join(`warehouse:${warehouseId}`);
    });
    
    // Join POS terminal room
    socket.on('join:pos', (terminalId) => {
      socket.join(`pos:${terminalId}`);
    });
    
    // Typing indicator for CRM
    socket.on('crm:typing', (data) => {
      socket.to(`company:${socket.companyId}`).emit('crm:typing', { ...data, userId: socket.userId });
    });
    
    // Barcode scan event
    socket.on('barcode:scan', async (data) => {
      try {
        const Product = require('../models/Product');
        const product = await Product.findOne({
          company: socket.companyId,
          $or: [{ barcode: data.barcode }, { sku: data.barcode }]
        }).populate('unit', 'shortName');
        
        socket.emit('barcode:result', {
          barcode: data.barcode,
          product: product || null,
          found: !!product
        });
      } catch (err) {
        socket.emit('barcode:error', { message: err.message });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} | Reason: ${reason}`);
      
      if (socket.companyId && companyRooms.has(socket.companyId)) {
        companyRooms.get(socket.companyId).delete(socket.id);
      }
      
      userSockets.delete(socket.userId);
      
      // Emit offline status
      if (socket.companyId) {
        socket.to(`company:${socket.companyId}`).emit('user:offline', { userId: socket.userId });
      }
    });
    
    // Error handler
    socket.on('error', (err) => {
      logger.error(`Socket error for ${socket.id}:`, err);
    });
  });
  
  logger.info('Socket.IO initialized');
  return io;
};

/**
 * Emit event to all users in a company
 */
const emitToCompany = (companyId, event, data, targetUserId = null) => {
  if (!io) return;
  
  if (targetUserId) {
    io.to(`user:${targetUserId}`).emit(event, data);
  } else {
    io.to(`company:${companyId}`).emit(event, data);
  }
};

/**
 * Emit to super admins
 */
const emitToSuperAdmin = (event, data) => {
  if (!io) return;
  io.to('super-admin').emit(event, data);
};

/**
 * Emit to warehouse users
 */
const emitToWarehouse = (warehouseId, event, data) => {
  if (!io) return;
  io.to(`warehouse:${warehouseId}`).emit(event, data);
};

/**
 * Get online users in a company
 */
const getOnlineUsers = (companyId) => {
  return companyRooms.get(companyId)?.size || 0;
};

module.exports = { setupSocketIO, emitToCompany, emitToSuperAdmin, emitToWarehouse, getOnlineUsers };
