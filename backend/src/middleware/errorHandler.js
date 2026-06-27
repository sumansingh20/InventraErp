'use strict';

const logger = require('../config/logger');

// Custom Error class
class AppError extends Error {
  constructor(message, statusCode, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};

// MongoDB duplicate key error
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyPattern)[0];
  const value = err.keyValue[field];
  return new AppError(`Duplicate value for field '${field}': "${value}". Please use a different value.`, 409);
};

// MongoDB validation error
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  return new AppError(`Validation failed: ${errors.join('. ')}`, 400);
};

// JWT errors
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Token expired. Please log in again.', 401);

// MongoDB cast error (invalid ID)
const handleCastError = (err) => {
  return new AppError(`Invalid value for field '${err.path}': ${err.value}`, 400);
};

// Global error handler
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Log error
  if (err.statusCode >= 500) {
    logger.error('ERROR:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      user: req.user?._id
    });
  }
  
  let error = { ...err };
  error.message = err.message;
  
  // Handle specific error types
  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKeyError(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  
  if (process.env.NODE_ENV === 'development') {
    res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message,
      data: error.data || null,
      stack: err.stack,
      error: err
    });
  } else {
    // Production: only send operational errors to client
    if (error.isOperational) {
      res.status(error.statusCode).json({
        success: false,
        status: error.status,
        message: error.message,
        data: error.data || null
      });
    } else {
      // Unknown error: don't leak details
      res.status(500).json({
        success: false,
        status: 'error',
        message: 'An internal server error occurred. Please try again later.'
      });
    }
  }
};

module.exports = { AppError, asyncHandler, notFoundHandler, globalErrorHandler };
