'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const maintenanceSchema = new Schema({
  description: String,
  cost: { type: Number, default: 0 },
  scheduledDate: Date,
  completedDate: Date,
  status: { type: String, enum: ['scheduled', 'completed', 'overdue'], default: 'scheduled' },
  performedBy: String
}, { _id: false });

const assetSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

  assetCode: { type: String, required: true },
  name: { type: String, required: true },
  description: String,

  assetType: {
    type: String,
    enum: ['computer', 'laptop', 'printer', 'scanner', 'server', 'networking', 'furniture', 'vehicle', 'machine', 'tool', 'mobile', 'tablet', 'camera', 'other'],
    default: 'other'
  },

  // Identity
  make: String,
  model: String,
  serialNumber: String,
  imei: String,
  macAddress: String,

  // Purchase
  purchaseDate: Date,
  purchasePrice: { type: Number, default: 0 },
  purchasedFrom: String,
  invoiceNumber: String,

  // Warranty
  warrantyStartDate: Date,
  warrantyEndDate: Date,
  warrantyVendor: String,

  // Depreciation
  depreciationMethod: { type: String, enum: ['straight_line', 'declining_balance', 'none'], default: 'straight_line' },
  usefulLifeYears: { type: Number, default: 3 },
  residualValue: { type: Number, default: 0 },
  currentBookValue: { type: Number, default: 0 },

  // Location
  location: String,

  // Assignment
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  assignedAt: Date,

  // Status
  status: {
    type: String,
    enum: ['available', 'assigned', 'under_maintenance', 'retired', 'lost', 'stolen'],
    default: 'available'
  },

  maintenanceHistory: [maintenanceSchema],
  nextMaintenanceDate: Date,

  documents: [{ name: String, url: String }],

  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

assetSchema.index({ company: 1, assetCode: 1 }, { unique: true, sparse: true });
assetSchema.index({ company: 1, assetType: 1 });
assetSchema.index({ company: 1, assignedTo: 1 });

const Asset = mongoose.model('Asset', assetSchema);
module.exports = Asset;
