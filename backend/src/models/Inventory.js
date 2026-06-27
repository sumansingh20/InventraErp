'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Inventory (stock per warehouse per product)
const inventorySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId }, // variant _id within product
  bin: { type: Schema.Types.ObjectId, ref: 'WarehouseBin' },
  shelf: { type: Schema.Types.ObjectId, ref: 'WarehouseShelf' },
  rack: { type: Schema.Types.ObjectId, ref: 'WarehouseRack' },
  zone: { type: Schema.Types.ObjectId, ref: 'WarehouseZone' },
  
  // Stock quantities
  quantity: { type: Number, default: 0 },
  reservedQty: { type: Number, default: 0 },
  availableQty: { type: Number, default: 0 },
  
  // Valuation
  costPrice: { type: Number, default: 0 }, // weighted avg / FIFO cost
  totalValue: { type: Number, default: 0 },
  
  // Reorder
  reorderLevel: { type: Number, default: 0 },
  reorderQty: { type: Number, default: 0 },
  
  // Last updated from which movement
  lastMovement: { type: Schema.Types.ObjectId, ref: 'StockMovement' },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

inventorySchema.index({ company: 1, warehouse: 1, product: 1, variant: 1 }, { unique: true, sparse: true });
inventorySchema.index({ company: 1, product: 1 });
inventorySchema.index({ company: 1, warehouse: 1 });
inventorySchema.index({ quantity: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

// Stock Movement (every stock in/out is tracked here)
const stockMovementSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId },
  batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
  serial: { type: Schema.Types.ObjectId, ref: 'Serial' },
  bin: { type: Schema.Types.ObjectId, ref: 'WarehouseBin' },
  
  // Movement type
  movementType: {
    type: String,
    required: true,
    enum: [
      'opening', 'purchase', 'purchase_return', 
      'sale', 'sale_return',
      'transfer_in', 'transfer_out',
      'adjustment_in', 'adjustment_out',
      'production_in', 'production_out',
      'damage', 'expired', 'scrap',
      'pos_sale', 'pos_return'
    ]
  },
  
  // Quantities
  quantity: { type: Number, required: true },
  previousStock: { type: Number, default: 0 },
  newStock: { type: Number, default: 0 },
  
  // Pricing
  costPrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  
  // Reference document
  referenceType: String, // 'PurchaseOrder', 'Invoice', 'SalesOrder', etc.
  referenceId: { type: Schema.Types.ObjectId },
  referenceNumber: String,
  
  // Transfer specific
  fromWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  toWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  // Barcode scan
  scannedBy: String,
  scanDevice: String,
  
  notes: String,
  
  // Performed by
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' }
}, { timestamps: true });

stockMovementSchema.index({ company: 1, product: 1, createdAt: -1 });
stockMovementSchema.index({ company: 1, warehouse: 1, createdAt: -1 });
stockMovementSchema.index({ referenceId: 1, referenceType: 1 });
stockMovementSchema.index({ company: 1, movementType: 1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

// Batch tracking
const batchSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  batchNumber: { type: String, required: true },
  lotNumber: String,
  manufacturingDate: Date,
  expiryDate: Date,
  quantity: { type: Number, default: 0 },
  availableQty: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  isActive: { type: Boolean, default: true },
  isExpired: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

batchSchema.index({ company: 1, product: 1, batchNumber: 1 });
batchSchema.index({ expiryDate: 1 });

const Batch = mongoose.model('Batch', batchSchema);

// Serial number tracking
const serialSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  serialNumber: { type: String, required: true },
  imei1: { type: String },
  imei2: { type: String },
  status: {
    type: String,
    enum: ['available', 'sold', 'reserved', 'returned', 'damaged', 'repaired'],
    default: 'available'
  },
  purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  soldAt: Date,
  warrantyExpiry: Date,
  serviceHistory: [{ type: Schema.Types.ObjectId, ref: 'ServiceRecord' }],
  returns: [{ type: Schema.Types.ObjectId, ref: 'Return' }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

serialSchema.index({ company: 1, product: 1, serialNumber: 1 }, { unique: true });
serialSchema.index({ serialNumber: 1 });

const Serial = mongoose.model('Serial', serialSchema);

module.exports = { Inventory, StockMovement, Batch, Serial };
