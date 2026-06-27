'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Warehouse Zone (e.g., Zone A, Cold Storage)
const warehouseZoneSchema = new Schema({
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  code: { type: String, uppercase: true },
  description: String,
  zoneType: {
    type: String,
    enum: ['receiving', 'storage', 'picking', 'packing', 'shipping', 'cold', 'hazmat', 'bulk', 'overflow'],
    default: 'storage'
  },
  totalShelves: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warehouseZoneSchema.index({ warehouse: 1 });
warehouseZoneSchema.index({ warehouse: 1, code: 1 }, { unique: true, sparse: true });

const WarehouseZone = mongoose.model('WarehouseZone', warehouseZoneSchema);

module.exports = WarehouseZone;
