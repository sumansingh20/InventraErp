'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const addressSchema = new Schema({
  line1: String,
  line2: String,
  city: String,
  state: String,
  pincode: String,
  country: { type: String, default: 'India' },
  coordinates: {
    lat: Number,
    lng: Number
  }
}, { _id: false });

const userSchema = new Schema({
  // Identity
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  avatar: String,
  
  // Role & Access
  role: { type: Schema.Types.ObjectId, ref: 'Role' },
  customRole: { type: String }, // For display
  isSuperAdmin: { type: Boolean, default: false },
  
  // Company Association
  company: { type: Schema.Types.ObjectId, ref: 'Company' },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  warehouses: [{ type: Schema.Types.ObjectId, ref: 'Warehouse' }],
  
  // Permissions override (granular)
  permissions: [{
    module: String,
    actions: [String] // create, read, update, delete, approve, export
  }],
  
  // Status
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  
  // 2FA
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  
  // Auth tokens
  refreshToken: { type: String, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerificationToken: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  
  // OTP
  otpCode: { type: String, select: false },
  otpExpires: { type: Date, select: false },
  otpType: { type: String, select: false },
  
  // Profile
  address: addressSchema,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // Preferences
  preferences: {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false }
    }
  },
  
  // Security
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  lastLogin: Date,
  lastLoginIP: String,
  lastLoginDevice: String,
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ company: 1, isActive: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

// Virtual: is account locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save: Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  next();
});

// Method: Check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method: Increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  return this.updateOne(updates);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
