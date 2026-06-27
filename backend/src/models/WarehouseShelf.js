'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const warehouseShelfSchema = new Schema({
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  zone: { type: Schema.Types.ObjectId, ref: 'WarehouseZone', required: true },
  rack: { type: Schema.Types.ObjectId, ref: 'WarehouseRack', required: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  code: { type: String, required: true, uppercase: true }, // e.g., SHELF-3
  description: String,
  totalBins: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warehouseShelfSchema.index({ rack: 1 });
warehouseShelfSchema.index({ warehouse: 1, code: 1 }, { unique: true, sparse: true });

const WarehouseShelf = mongoose.model('WarehouseShelf', warehouseShelfSchema);
module.exports = WarehouseShelf;
