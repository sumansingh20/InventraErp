'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const addressSchema = new Schema({
  line1: String,
  line2: String,
  city: String,
  state: String,
  stateCode: String,
  pincode: String,
  country: { type: String, default: 'India' }
}, { _id: false });

const customerSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  // Type
  customerType: {
    type: String,
    enum: ['individual', 'business', 'walk_in'],
    default: 'individual'
  },
  
  // Identity
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true }, // Auto-generated
  salutation: { type: String, enum: ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'] },
  companyName: String,
  
  // Contact
  email: String,
  phone: { type: String, trim: true },
  alternatePhone: String,
  whatsapp: String,
  website: String,
  
  // Tax
  gstin: { type: String, uppercase: true },
  pan: String,
  gstRegistrationType: {
    type: String,
    enum: ['regular', 'composition', 'unregistered', 'consumer'],
    default: 'unregistered'
  },
  
  // Addresses
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  sameAsShipping: { type: Boolean, default: true },
  
  // Financial
  creditLimit: { type: Number, default: 0 },
  creditDays: { type: Number, default: 0 },
  openingBalance: { type: Number, default: 0 },
  openingBalanceType: { type: String, enum: ['debit', 'credit'], default: 'debit' },
  
  // Wallet / Store Credit
  walletBalance: { type: Number, default: 0 },
  
  // Loyalty
  loyaltyPoints: { type: Number, default: 0 },
  loyaltyTier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze' },
  
  // Pricing
  priceGroup: { type: String, enum: ['retail', 'wholesale', 'vip', 'custom'], default: 'retail' },
  discountPercent: { type: Number, default: 0 },
  
  // Statistics (denormalized for performance)
  totalOrders: { type: Number, default: 0 },
  totalPurchaseAmount: { type: Number, default: 0 },
  totalPaidAmount: { type: Number, default: 0 },
  totalOutstanding: { type: Number, default: 0 },
  lastOrderDate: Date,
  
  // Notes
  notes: String,
  tags: [String],
  
  // Linked user account
  userAccount: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // CRM
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  segment: String,
  source: String, // how they came (walk-in, referral, online, etc.)
  
  // Status
  isActive: { type: Boolean, default: true },
  isBlacklisted: { type: Boolean, default: false },
  blacklistReason: String,
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

customerSchema.index({ company: 1, phone: 1 });
customerSchema.index({ company: 1, email: 1 });
customerSchema.index({ company: 1, name: 'text', phone: 'text', code: 'text' });
customerSchema.index({ company: 1, isActive: 1 });
customerSchema.index({ 'gst.gstin': 1 }, { sparse: true });

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;
