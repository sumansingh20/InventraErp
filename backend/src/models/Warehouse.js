'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const warehouseSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  name: { type: String, required: true, trim: true },
  code: { type: String, uppercase: true },
  description: String,
  
  // Address
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
    coordinates: { lat: Number, lng: Number }
  },
  
  // Contact
  phone: String,
  email: String,
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Capacity
  totalArea: { type: Number, default: 0 }, // in sq ft
  usedArea: { type: Number, default: 0 },
  totalCapacity: { type: Number, default: 0 }, // in units/pallets
  
  // Type
  warehouseType: {
    type: String,
    enum: ['main', 'transit', 'cold_storage', 'bonded', 'distribution', 'retail'],
    default: 'main'
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // Settings
  settings: {
    allowNegativeStock: { type: Boolean, default: false },
    enableBinManagement: { type: Boolean, default: false },
    enableZoneManagement: { type: Boolean, default: false }
  },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warehouseSchema.index({ company: 1, isActive: 1 });
warehouseSchema.index({ company: 1, code: 1 }, { unique: true, sparse: true });

// Virtuals
warehouseSchema.virtual('zones', {
  ref: 'WarehouseZone',
  localField: '_id',
  foreignField: 'warehouse'
});

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
module.exports = Warehouse;
