'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const contractSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

  contractNumber: { type: String, required: true },
  title: { type: String, required: true },
  description: String,

  contractType: {
    type: String,
    enum: ['supplier', 'customer', 'employee', 'lease', 'service', 'maintenance', 'nda', 'partnership', 'other'],
    default: 'other'
  },

  // Party
  partyType: { type: String, enum: ['supplier', 'customer', 'employee', 'other'] },
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee' },
  partyName: String,

  // Terms
  startDate: { type: Date, required: true },
  endDate: Date,
  contractValue: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  paymentTerms: String,
  renewalType: { type: String, enum: ['manual', 'auto', 'none'], default: 'none' },
  renewalNoticeDays: { type: Number, default: 30 },

  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'terminated', 'renewed', 'under_review'],
    default: 'draft'
  },

  // Documents
  documents: [{
    name: String,
    url: String,
    version: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Reminders
  reminders: [{
    daysBeforeExpiry: Number,
    sent: { type: Boolean, default: false },
    sentAt: Date
  }],

  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

contractSchema.index({ company: 1, contractNumber: 1 }, { unique: true, sparse: true });
contractSchema.index({ company: 1, status: 1 });
contractSchema.index({ company: 1, endDate: 1 });

const Contract = mongoose.model('Contract', contractSchema);
module.exports = Contract;
