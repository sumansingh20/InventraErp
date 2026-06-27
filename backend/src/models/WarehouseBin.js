'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const warehouseBinSchema = new Schema({
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  zone: { type: Schema.Types.ObjectId, ref: 'WarehouseZone', required: true },
  rack: { type: Schema.Types.ObjectId, ref: 'WarehouseRack', required: true },
  shelf: { type: Schema.Types.ObjectId, ref: 'WarehouseShelf', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  binCode: { type: String, required: true, uppercase: true }, // e.g., BIN-8
  
  // Capacity
  maxCapacity: { type: Number, default: 0 },
  currentCapacity: { type: Number, default: 0 },
  unit: { type: String, default: 'units' },
  
  // Current product
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  
  binType: {
    type: String,
    enum: ['standard', 'bulk', 'cold', 'flammable', 'heavy', 'fragile'],
    default: 'standard'
  },
  
  isActive: { type: Boolean, default: true },
  isOccupied: { type: Boolean, default: false },
  
  barcode: String,
  qrCode: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warehouseBinSchema.index({ warehouse: 1, binCode: 1 }, { unique: true });
warehouseBinSchema.index({ shelf: 1 });

const WarehouseBin = mongoose.model('WarehouseBin', warehouseBinSchema);
module.exports = WarehouseBin;
