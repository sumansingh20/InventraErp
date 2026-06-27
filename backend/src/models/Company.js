'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const bankAccountSchema = new Schema({
  bankName: String,
  accountName: String,
  accountNumber: String,
  ifscCode: String,
  branchName: String,
  accountType: { type: String, enum: ['current', 'savings', 'overdraft'], default: 'current' },
  upiId: String,
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const gstDetailsSchema = new Schema({
  gstin: { type: String, uppercase: true },
  gstRegistrationType: {
    type: String,
    enum: ['regular', 'composition', 'unregistered', 'sez', 'deemed_export'],
    default: 'regular'
  },
  gstState: String,
  gstStateCode: String,
  isRcmApplicable: { type: Boolean, default: false },
  isTdsApplicable: { type: Boolean, default: false },
  tdsSection: String,
  tdsRate: { type: Number, default: 0 }
}, { _id: false });

const addressSchema = new Schema({
  line1: String,
  line2: String,
  city: String,
  state: String,
  stateCode: String,
  pincode: String,
  country: { type: String, default: 'India' }
}, { _id: false });

const companySchema = new Schema({
  // Basic Info
  name: { type: String, required: true, trim: true },
  legalName: { type: String, trim: true },
  slug: { type: String, unique: true },
  logo: String,
  favicon: String,
  
  // Contact
  email: String,
  phone: String,
  alternatePhone: String,
  website: String,
  
  // Address
  address: addressSchema,
  
  // Legal & Tax
  pan: { type: String, uppercase: true },
  cin: String, // Company Identification Number
  tan: String,
  gst: gstDetailsSchema,
  
  // Financial
  financialYear: {
    start: { type: String, default: '04-01' }, // MM-DD
    end: { type: String, default: '03-31' }
  },
  currency: { type: String, default: 'INR' },
  currencySymbol: { type: String, default: '₹' },
  decimalPlaces: { type: Number, default: 2 },
  
  // Bank Accounts
  bankAccounts: [bankAccountSchema],
  
  // Industry
  industry: String,
  businessType: {
    type: String,
    enum: ['retail', 'wholesale', 'manufacturing', 'service', 'restaurant', 'pharmacy', 'ecommerce', 'other']
  },
  
  // Branding
  primaryColor: { type: String, default: '#6366f1' },
  secondaryColor: { type: String, default: '#8b5cf6' },
  invoicePrefix: { type: String, default: 'INV' },
  poPrefix: { type: String, default: 'PO' },
  soPrefix: { type: String, default: 'SO' },
  
  // Subscription
  subscription: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  plan: { type: String, default: 'trial' },
  trialEndsAt: Date,
  isSubscriptionActive: { type: Boolean, default: true },
  
  // Features (enabled by subscription plan)
  enabledFeatures: [String],
  
  // Settings
  settings: {
    invoiceTerms: { type: String, default: 'Payment due within 30 days.' },
    invoiceFooter: String,
    enableEInvoice: { type: Boolean, default: false },
    enableEWayBill: { type: Boolean, default: false },
    enableRoundOff: { type: Boolean, default: true },
    enablePosMode: { type: Boolean, default: true },
    enableMultiCurrency: { type: Boolean, default: false },
    enableMultiBranch: { type: Boolean, default: false },
    enableMultiWarehouse: { type: Boolean, default: false },
    autoGenerateSku: { type: Boolean, default: true },
    enableBatchTracking: { type: Boolean, default: false },
    enableSerialTracking: { type: Boolean, default: false },
    enableExpiryTracking: { type: Boolean, default: false },
    lowStockAlert: { type: Boolean, default: true },
    lowStockThreshold: { type: Number, default: 10 },
    taxInclusive: { type: Boolean, default: false },
    enableSalesApproval: { type: Boolean, default: false },
    enablePurchaseApproval: { type: Boolean, default: false },
    inventoryValuationMethod: {
      type: String,
      enum: ['fifo', 'lifo', 'weighted_average'],
      default: 'weighted_average'
    }
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  verifiedAt: Date,
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Owner
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Documents (GST cert, PAN, etc.)
  documents: [{
    type: String,
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

companySchema.index({ slug: 1 });
companySchema.index({ 'gst.gstin': 1 });
companySchema.index({ owner: 1 });
companySchema.index({ isActive: 1 });

companySchema.virtual('branches', {
  ref: 'Branch',
  localField: '_id',
  foreignField: 'company'
});

const Company = mongoose.model('Company', companySchema);
module.exports = Company;
