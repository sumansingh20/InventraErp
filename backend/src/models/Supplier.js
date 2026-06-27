'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const supplierSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  // Type
  supplierType: {
    type: String,
    enum: ['manufacturer', 'wholesaler', 'distributor', 'retailer', 'importer', 'trader'],
    default: 'wholesaler'
  },
  
  // Identity
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true },
  companyName: String,
  
  // Contact
  email: String,
  phone: { type: String, trim: true },
  alternatePhone: String,
  whatsapp: String,
  website: String,
  
  // Contact Persons
  contactPersons: [{
    name: String,
    designation: String,
    email: String,
    phone: String
  }],
  
  // Tax
  gstin: { type: String, uppercase: true },
  pan: String,
  gstRegistrationType: {
    type: String,
    enum: ['regular', 'composition', 'unregistered', 'sez'],
    default: 'regular'
  },
  
  // Address
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    stateCode: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  
  // Bank Details
  bankDetails: [{
    bankName: String,
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Financial
  openingBalance: { type: Number, default: 0 },
  openingBalanceType: { type: String, enum: ['debit', 'credit'], default: 'credit' },
  creditLimit: { type: Number, default: 0 },
  paymentTerms: { type: Number, default: 30 }, // days
  
  // TDS
  isTdsApplicable: { type: Boolean, default: false },
  tdsSection: String,
  tdsRate: { type: Number, default: 0 },
  
  // Statistics
  totalOrders: { type: Number, default: 0 },
  totalPurchaseAmount: { type: Number, default: 0 },
  totalPaidAmount: { type: Number, default: 0 },
  totalOutstanding: { type: Number, default: 0 },
  lastOrderDate: Date,
  
  // Rating
  rating: { type: Number, min: 1, max: 5 },
  notes: String,
  tags: [String],
  
  // Assigned
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Status
  isActive: { type: Boolean, default: true },
  isBlacklisted: { type: Boolean, default: false },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

supplierSchema.index({ company: 1, phone: 1 });
supplierSchema.index({ company: 1, name: 'text', phone: 'text', code: 'text' });
supplierSchema.index({ company: 1, isActive: 1 });
supplierSchema.index({ gstin: 1 }, { sparse: true });

const Supplier = mongoose.model('Supplier', supplierSchema);
module.exports = Supplier;
