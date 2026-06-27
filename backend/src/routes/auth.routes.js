'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { body, validationResult } = require('express-validator');

// ─── Validation Middleware ────────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  body('companyName').optional().trim().isLength({ max: 200 }),
  validate
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

// ─── Public Routes ─────────────────────────────────────────────────────────────
router.post('/register', rateLimiter.auth, registerValidation, authController.register);
router.post('/login', rateLimiter.auth, loginValidation, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/forgot-password', rateLimiter.passwordReset, authController.forgotPassword);
router.post('/reset-password', rateLimiter.passwordReset, authController.resetPassword);
router.post('/verify-email', authController.verifyEmail);

// ─── Protected Routes ──────────────────────────────────────────────────────────
router.use(authenticate);

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.patch('/profile', authController.updateProfile);
router.post('/change-password', authController.changePassword);

// 2FA
router.post('/2fa/setup', authController.setup2FA);
router.post('/2fa/enable', authController.enable2FA);
router.post('/2fa/disable', authController.disable2FA);

module.exports = router;
