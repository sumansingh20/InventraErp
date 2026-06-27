'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const branchSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true },
  
  // Contact
  email: String,
  phone: String,
  
  // Address
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    stateCode: String,
    pincode: String,
    country: { type: String, default: 'India' },
    coordinates: { lat: Number, lng: Number }
  },
  
  // GST (branch may have own GSTIN)
  gstin: { type: String, uppercase: true },
  
  // Manager
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Financial
  defaultWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  // Status
  isActive: { type: Boolean, default: true },
  isHeadOffice: { type: Boolean, default: false },
  
  // Settings
  settings: {
    allowNegativeStock: { type: Boolean, default: false },
    invoicePrefix: String,
    taxInclusive: { type: Boolean, default: false }
  },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

branchSchema.index({ company: 1 });
branchSchema.index({ company: 1, code: 1 }, { unique: true, sparse: true });

const Branch = mongoose.model('Branch', branchSchema);
module.exports = Branch;
