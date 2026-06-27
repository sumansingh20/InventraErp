'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const warehouseRackSchema = new Schema({
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  zone: { type: Schema.Types.ObjectId, ref: 'WarehouseZone', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  code: { type: String, required: true, uppercase: true }, // e.g., RACK-12
  description: String,
  totalShelves: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warehouseRackSchema.index({ warehouse: 1, zone: 1 });
warehouseRackSchema.index({ warehouse: 1, code: 1 }, { unique: true, sparse: true });

const WarehouseRack = mongoose.model('WarehouseRack', warehouseRackSchema);
module.exports = WarehouseRack;
