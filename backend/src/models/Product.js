'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const taxSchema = new Schema({
  name: String,
  rate: { type: Number, default: 0 },
  type: { type: String, enum: ['GST', 'IGST', 'CGST', 'SGST', 'VAT', 'custom'] },
  hsnCode: String,
  sacCode: String
}, { _id: false });

const variantSchema = new Schema({
  name: String, // e.g., "Red - XL"
  sku: String,
  barcode: String,
  color: String,
  size: String,
  weight: Number,
  weightUnit: String,
  purchasePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  images: [String],
  isActive: { type: Boolean, default: true }
}, { _id: true });

const productSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  // Basic Info
  name: { type: String, required: true, trim: true },
  description: String,
  shortDescription: String,
  sku: { type: String, trim: true },
  barcode: String,
  qrCode: String,
  slug: String,
  
  // Classification
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
  subCategory: { type: Schema.Types.ObjectId, ref: 'Category' },
  brand: { type: Schema.Types.ObjectId, ref: 'Brand' },
  tags: [String],
  
  // Type
  productType: {
    type: String,
    enum: ['simple', 'variant', 'bundle', 'composite', 'service', 'digital', 'raw_material', 'finished_good', 'semi_finished'],
    default: 'simple'
  },
  
  // Units
  unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  purchaseUnit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  purchaseUnitConversion: { type: Number, default: 1 },
  
  // Pricing
  purchasePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  wholesalePrice: { type: Number, default: 0 },
  minSellingPrice: { type: Number, default: 0 },
  
  // Tax
  taxable: { type: Boolean, default: true },
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
  taxes: [taxSchema],
  hsnCode: String,
  sacCode: String,
  
  // Stock Management
  trackInventory: { type: Boolean, default: true },
  openingStock: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  reservedStock: { type: Number, default: 0 },
  availableStock: { type: Number, default: 0 },
  
  // Reorder
  reorderLevel: { type: Number, default: 0 },
  reorderQty: { type: Number, default: 0 },
  maxStock: { type: Number, default: 0 },
  
  // Physical
  weight: Number,
  weightUnit: String,
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: String
  },
  
  // Batch, Serial & Warranty
  trackBatch: { type: Boolean, default: false },
  trackSerial: { type: Boolean, default: false },
  trackExpiry: { type: Boolean, default: false },
  trackImei: { type: Boolean, default: false },
  warranty: { type: Schema.Types.ObjectId, ref: 'Warranty' },

  
  // Images
  images: [String],
  primaryImage: String,
  
  // Variants
  hasVariants: { type: Boolean, default: false },
  variantAttributes: [String], // ['color', 'size']
  variants: [variantSchema],
  
  // Bundle/Composite items
  bundleItems: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    unit: { type: Schema.Types.ObjectId, ref: 'Unit' }
  }],
  
  // Supplier
  preferredSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierSku: String,
  
  // Warehouse default location
  defaultWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  defaultBin: { type: Schema.Types.ObjectId, ref: 'WarehouseBin' },
  
  // E-commerce
  isSellable: { type: Boolean, default: true },
  isPurchasable: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: false },
  
  // Status
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  
  // Accounting
  purchaseAccount: { type: Schema.Types.ObjectId, ref: 'Account' },
  salesAccount: { type: Schema.Types.ObjectId, ref: 'Account' },
  inventoryAccount: { type: Schema.Types.ObjectId, ref: 'Account' },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
productSchema.index({ company: 1, sku: 1 }, { unique: true, sparse: true });
productSchema.index({ company: 1, barcode: 1 }, { sparse: true });
productSchema.index({ company: 1, name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ company: 1, category: 1 });
productSchema.index({ company: 1, brand: 1 });
productSchema.index({ company: 1, isActive: 1 });
productSchema.index({ company: 1, currentStock: 1 });

// Virtual: effective tax rate
productSchema.virtual('effectiveTaxRate').get(function () {
  return this.taxes.reduce((sum, t) => sum + (t.rate || 0), 0);
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
