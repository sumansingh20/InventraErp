'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Category ─────────────────────────────────────────────────────────────────
const categorySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true, trim: true },
  slug: String,
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  description: String,
  image: String,
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

categorySchema.index({ company: 1, parent: 1 });
categorySchema.index({ company: 1, slug: 1 });

const Category = mongoose.model('Category', categorySchema);

// ─── Brand ────────────────────────────────────────────────────────────────────
const brandSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true, trim: true },
  logo: String,
  description: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

brandSchema.index({ company: 1 });
const Brand = mongoose.model('Brand', brandSchema);

// ─── Unit of Measurement ──────────────────────────────────────────────────────
const unitSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  shortName: { type: String, required: true },
  unitType: {
    type: String,
    enum: ['quantity', 'weight', 'volume', 'length', 'area', 'time', 'digital'],
    default: 'quantity'
  },
  isBase: { type: Boolean, default: true },
  conversionFactor: { type: Number, default: 1 }, // relative to base unit
  baseUnit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

unitSchema.index({ company: 1 });
const Unit = mongoose.model('Unit', unitSchema);

module.exports = { Category, Brand, Unit };
