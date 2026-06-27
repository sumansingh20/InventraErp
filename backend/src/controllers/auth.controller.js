'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const Role = require('../models/Role');
const Company = require('../models/Company');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/email.service');
const smsService = require('../services/sms.service');
const logger = require('../config/logger');

// ─── Token Generators ──────────────────────────────────────────────────────────
const signAccessToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRE || '15m'
});

const signRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
  expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
});

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie('jwt', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  
  // Save refresh token hash
  User.findByIdAndUpdate(user._id, {
    refreshToken: crypto.createHash('sha256').update(refreshToken).digest('hex'),
    lastLogin: new Date()
  }).exec();
  
  setCookies(res, accessToken, refreshToken);
  
  // Remove sensitive fields
  const userData = user.toObject ? user.toObject() : { ...user };
  delete userData.password;
  delete userData.refreshToken;
  delete userData.twoFactorSecret;
  delete userData.otpCode;
  
  res.status(statusCode).json({
    success: true,
    message,
    data: {
      user: userData,
      accessToken,
      refreshToken
    }
  });
};

// ─── Register ──────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, phone, password, companyName, businessType } = req.body;
  
  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('An account with this email already exists.', 409));
  }
  
  // Get default company_owner role
  let ownerRole = await Role.findOne({ slug: 'company_owner', company: null });
  
  // Create company
  const company = await Company.create({
    name: companyName || `${name}'s Business`,
    businessType: businessType || 'retail',
    plan: 'trial',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
  });
  
  // Create user
  const user = await User.create({
    name,
    email,
    phone,
    password,
    company: company._id,
    role: ownerRole?._id,
    customRole: 'company_owner',
    isEmailVerified: false
  });
  
  // Update company owner
  company.owner = user._id;
  await company.save();
  
  // Send verification email
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
  
  await User.findByIdAndUpdate(user._id, {
    emailVerificationToken: verifyHash,
    emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000
  });
  
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
  
  emailService.sendWelcomeEmail(user, verifyUrl).catch(err => {
    logger.error('Welcome email failed:', err);
  });
  
  // Initialize default chart of accounts
  await initializeDefaultAccounts(company._id, user._id);
  
  sendTokenResponse(user, 201, res, 'Account created successfully. Please verify your email.');
});

// ─── Login ─────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password, otp } = req.body;
  
  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }
  
  // Find user with password
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +twoFactorSecret +twoFactorEnabled +loginAttempts +lockUntil +otpCode +otpExpires')
    .populate('role');
  
  if (!user) {
    return next(new AppError('Invalid email or password.', 401));
  }
  
  // Check if account is locked
  if (user.isLocked) {
    return next(new AppError('Account locked due to too many failed attempts. Please try again in 2 hours.', 403));
  }
  
  // Check password
  const isPasswordCorrect = await user.comparePassword(password);
  
  if (!isPasswordCorrect) {
    await user.incrementLoginAttempts();
    return next(new AppError('Invalid email or password.', 401));
  }
  
  // Reset login attempts on success
  if (user.loginAttempts > 0) {
    await User.findByIdAndUpdate(user._id, {
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Check 2FA
  if (user.twoFactorEnabled) {
    if (!otp) {
      return res.status(200).json({
        success: true,
        requiresTwoFactor: true,
        message: 'Please enter your 2FA code.',
        userId: user._id
      });
    }
    
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: otp,
      window: 1
    });
    
    if (!verified) {
      return next(new AppError('Invalid 2FA code.', 401));
    }
  }
  
  // Update last login
  await User.findByIdAndUpdate(user._id, {
    lastLogin: new Date(),
    lastLoginIP: req.ip
  });
  
  sendTokenResponse(user, 200, res, 'Login successful.');
});

// ─── Refresh Token ─────────────────────────────────────────────────────────────
exports.refreshToken = asyncHandler(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
  
  if (!refreshToken) {
    return next(new AppError('Refresh token required.', 401));
  }
  
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }
  
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const user = await User.findOne({ _id: decoded.id, refreshToken: tokenHash })
    .populate('role');
  
  if (!user || !user.isActive) {
    return next(new AppError('Invalid refresh token. Please log in again.', 401));
  }
  
  sendTokenResponse(user, 200, res, 'Token refreshed successfully.');
});

// ─── Logout ────────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res, next) => {
  // Invalidate refresh token
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
  
  res.clearCookie('jwt');
  res.clearCookie('refreshToken');
  
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ─── Forgot Password ───────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user) {
    // Security: don't reveal if email exists
    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  }
  
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  
  await User.findByIdAndUpdate(user._id, {
    passwordResetToken: resetHash,
    passwordResetExpires: Date.now() + 60 * 60 * 1000 // 1 hour
  });
  
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  try {
    await emailService.sendPasswordResetEmail(user, resetUrl);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    await User.findByIdAndUpdate(user._id, {
      $unset: { passwordResetToken: 1, passwordResetExpires: 1 }
    });
    return next(new AppError('Failed to send reset email. Please try again.', 500));
  }
});

// ─── Reset Password ────────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token, password } = req.body;
  
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Invalid or expired reset token.', 400));
  }
  
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
  
  emailService.sendPasswordChangedEmail(user).catch(err => logger.error('Password changed email error:', err));
  
  res.json({ success: true, message: 'Password reset successfully. Please log in.' });
});

// ─── Change Password ───────────────────────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user._id).select('+password');
  
  const isCorrect = await user.comparePassword(currentPassword);
  if (!isCorrect) {
    return next(new AppError('Current password is incorrect.', 400));
  }
  
  user.password = newPassword;
  await user.save();
  
  res.json({ success: true, message: 'Password changed successfully.' });
});

// ─── Verify Email ──────────────────────────────────────────────────────────────
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.body;
  
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await User.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Invalid or expired verification token.', 400));
  }
  
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  
  res.json({ success: true, message: 'Email verified successfully.' });
});

// ─── Setup 2FA ─────────────────────────────────────────────────────────────────
exports.setup2FA = asyncHandler(async (req, res, next) => {
  const secret = speakeasy.generateSecret({
    name: `Inventra ERP (${req.user.email})`,
    issuer: 'Inventra ERP',
    length: 20
  });
  
  await User.findByIdAndUpdate(req.user._id, {
    twoFactorSecret: secret.base32
  });
  
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  
  res.json({
    success: true,
    data: {
      secret: secret.base32,
      qrCode
    }
  });
});

// ─── Enable 2FA ─────────────────────────────────────────────────────────────────
exports.enable2FA = asyncHandler(async (req, res, next) => {
  const { otp } = req.body;
  
  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: otp,
    window: 1
  });
  
  if (!verified) {
    return next(new AppError('Invalid OTP. Please try again.', 400));
  }
  
  await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: true });
  
  res.json({ success: true, message: '2FA enabled successfully.' });
});

// ─── Disable 2FA ────────────────────────────────────────────────────────────────
exports.disable2FA = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  
  const user = await User.findById(req.user._id).select('+password');
  const isCorrect = await user.comparePassword(password);
  
  if (!isCorrect) {
    return next(new AppError('Incorrect password.', 400));
  }
  
  await User.findByIdAndUpdate(req.user._id, {
    twoFactorEnabled: false,
    $unset: { twoFactorSecret: 1 }
  });
  
  res.json({ success: true, message: '2FA disabled successfully.' });
});

// ─── Get Profile ────────────────────────────────────────────────────────────────
exports.getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .populate('role')
    .populate('company', 'name logo businessType plan')
    .populate('branch', 'name code');
  
  res.json({ success: true, data: { user } });
});

// ─── Update Profile ─────────────────────────────────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const allowedFields = ['name', 'phone', 'address', 'dateOfBirth', 'gender', 'preferences'];
  const updates = {};
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });
  
  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  }).populate('role').populate('company', 'name logo');
  
  res.json({ success: true, message: 'Profile updated successfully.', data: { user } });
});

// ─── Helper: Initialize Default Chart of Accounts ─────────────────────────────
async function initializeDefaultAccounts(companyId, userId) {
  try {
    const { Account } = require('../models/Accounting');
    
    const defaultAccounts = [
      // Assets
      { code: '1000', name: 'Assets', accountType: 'asset', accountGroup: 'current_assets', normalBalance: 'debit', level: 1, isSystem: true },
      { code: '1100', name: 'Current Assets', accountType: 'asset', accountGroup: 'current_assets', normalBalance: 'debit', level: 2, isSystem: true },
      { code: '1110', name: 'Cash in Hand', accountType: 'cash', isCashAccount: true, accountGroup: 'current_assets', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '1120', name: 'Bank Account', accountType: 'bank', isBankAccount: true, accountGroup: 'current_assets', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '1130', name: 'Accounts Receivable', accountType: 'accounts_receivable', accountGroup: 'current_assets', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '1140', name: 'Inventory Asset', accountType: 'stock', accountGroup: 'current_assets', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '1200', name: 'Fixed Assets', accountType: 'fixed_asset', accountGroup: 'fixed_assets', normalBalance: 'debit', level: 2, isSystem: true },
      
      // Liabilities
      { code: '2000', name: 'Liabilities', accountType: 'liability', accountGroup: 'current_liabilities', normalBalance: 'credit', level: 1, isSystem: true },
      { code: '2100', name: 'Current Liabilities', accountType: 'liability', accountGroup: 'current_liabilities', normalBalance: 'credit', level: 2, isSystem: true },
      { code: '2110', name: 'Accounts Payable', accountType: 'accounts_payable', accountGroup: 'current_liabilities', normalBalance: 'credit', level: 3, isSystem: true },
      { code: '2120', name: 'GST Payable', accountType: 'tax', accountGroup: 'current_liabilities', normalBalance: 'credit', level: 3, isSystem: true },
      { code: '2130', name: 'TDS Payable', accountType: 'tax', accountGroup: 'current_liabilities', normalBalance: 'credit', level: 3, isSystem: true },
      
      // Equity
      { code: '3000', name: 'Equity', accountType: 'equity', accountGroup: 'equity', normalBalance: 'credit', level: 1, isSystem: true },
      { code: '3100', name: "Owner's Capital", accountType: 'equity', accountGroup: 'equity', normalBalance: 'credit', level: 2, isSystem: true },
      { code: '3200', name: 'Retained Earnings', accountType: 'equity', accountGroup: 'equity', normalBalance: 'credit', level: 2, isSystem: true },
      
      // Income
      { code: '4000', name: 'Income', accountType: 'income', accountGroup: 'revenue', normalBalance: 'credit', level: 1, isSystem: true },
      { code: '4100', name: 'Sales Revenue', accountType: 'income', accountGroup: 'revenue', normalBalance: 'credit', level: 2, isSystem: true },
      { code: '4200', name: 'Other Income', accountType: 'income', accountGroup: 'other_income', normalBalance: 'credit', level: 2, isSystem: true },
      
      // Expenses
      { code: '5000', name: 'Expenses', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 1, isSystem: true },
      { code: '5100', name: 'Cost of Goods Sold', accountType: 'expense', accountGroup: 'cost_of_goods', normalBalance: 'debit', level: 2, isSystem: true },
      { code: '5200', name: 'Operating Expenses', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 2, isSystem: true },
      { code: '5210', name: 'Rent Expense', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '5220', name: 'Salary Expense', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '5230', name: 'Utilities Expense', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '5240', name: 'Marketing Expense', accountType: 'expense', accountGroup: 'operating_expenses', normalBalance: 'debit', level: 3, isSystem: true },
      { code: '5300', name: 'Other Expenses', accountType: 'expense', accountGroup: 'other_expenses', normalBalance: 'debit', level: 2, isSystem: true }
    ];
    
    const docs = defaultAccounts.map(a => ({
      ...a,
      company: companyId,
      createdBy: userId
    }));
    
    await Account.insertMany(docs, { ordered: false }).catch(() => {}); // Ignore duplicates
  } catch (err) {
    logger.error('Failed to initialize default accounts:', err);
  }
}
