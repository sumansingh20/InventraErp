'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * INVENTRA ENTERPRISE SECURITY CENTER
 * Device session tracking for concurrent session control & device fingerprinting.
 */
const deviceSessionSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company' },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  // Session identity
  sessionId: { type: String, required: true, unique: true },
  jwtJti: String, // JWT ID for revocation

  // Device fingerprint
  deviceFingerprint: String,
  deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'api', 'unknown'], default: 'unknown' },
  deviceName: String,
  os: String,
  browser: String,
  userAgent: String,

  // Network
  ipAddress: String,
  country: String,
  city: String,
  isp: String,

  // Session lifecycle
  isActive: { type: Boolean, default: true, index: true },
  loginAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  expiresAt: Date,
  logoutAt: Date,
  logoutReason: { type: String, enum: ['user', 'admin_kill', 'expired', 'suspicious', 'password_change', 'concurrent_limit'] },

  // Risk
  riskScore: { type: Number, default: 0 },
  isAnomaly: { type: Boolean, default: false },
  anomalyReason: String,

  // 2FA
  twoFactorVerified: { type: Boolean, default: false },
  twoFactorMethod: String
}, { timestamps: true });

deviceSessionSchema.index({ user: 1, isActive: 1 });
deviceSessionSchema.index({ sessionId: 1 }, { unique: true });
deviceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DeviceSession = mongoose.model('DeviceSession', deviceSessionSchema);
module.exports = DeviceSession;
