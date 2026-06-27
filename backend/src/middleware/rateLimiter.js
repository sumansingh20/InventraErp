'use strict';

const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    success: false,
    status: 'fail',
    message
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    next(new AppError(options.message.message, 429));
  }
});

module.exports = {
  // Auth endpoints (login, register, otp)
  auth: createLimiter(
    15 * 60 * 1000, // 15 minutes
    parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
    'Too many authentication attempts. Please try again after 15 minutes.'
  ),
  
  // General API
  api: createLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX) || 100,
    'Too many requests from this IP. Please try again later.'
  ),
  
  // File uploads
  upload: createLimiter(
    60 * 60 * 1000, // 1 hour
    50,
    'Too many file uploads. Please try again later.'
  ),
  
  // Password reset
  passwordReset: createLimiter(
    60 * 60 * 1000,
    5,
    'Too many password reset attempts. Please try again after 1 hour.'
  )
};
