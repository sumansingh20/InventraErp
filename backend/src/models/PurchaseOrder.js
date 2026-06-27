'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const lineItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId },
  batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
  serial: [{ type: Schema.Types.ObjectId, ref: 'Serial' }],
  
  name: String, // snapshot
  sku: String,
  barcode: String,
  hsnCode: String,
  
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  
  // Pricing
  purchasePrice: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // percentage
  discountAmount: { type: Number, default: 0 },
  
  // Tax
  taxRate: { type: Number, default: 0 },
  cgstRate: { type: Number, default: 0 },
  sgstRate: { type: Number, default: 0 },
  igstRate: { type: Number, default: 0 },
  cessRate: { type: Number, default: 0 },
  
  taxableAmount: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  cessAmount: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  
  subtotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  
  // Received / pending (for GRN)
  orderedQty: { type: Number, default: 0 },
  receivedQty: { type: Number, default: 0 },
  pendingQty: { type: Number, default: 0 },
  
  // Warehouse
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  bin: { type: Schema.Types.ObjectId, ref: 'WarehouseBin' },
  
  notes: String
}, { _id: true });

const purchaseOrderSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  // Number
  poNumber: { type: String, required: true },
  
  // Type
  orderType: {
    type: String,
    enum: ['purchase_order', 'rfq', 'purchase_return'],
    default: 'purchase_order'
  },
  
  // Supplier
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: String, // snapshot
  supplierGstin: String,
  supplierAddress: Schema.Types.Mixed,
  
  // Dates
  orderDate: { type: Date, default: Date.now },
  expectedDelivery: Date,
  
  // Reference
  supplierReferenceNo: String,
  
  // Items
  items: [lineItemSchema],
  
  // Totals
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  cessAmount: { type: Number, default: 0 },
  shippingCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  
  // GRN Status
  status: {
    type: String,
    enum: ['draft', 'sent', 'confirmed', 'partial', 'received', 'closed', 'cancelled'],
    default: 'draft'
  },
  
  // Approval
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedReason: String,
  
  // Payment
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid'
  },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  
  // Tax
  isInterState: { type: Boolean, default: false },
  placeOfSupply: String,
  reverseCharge: { type: Boolean, default: false },
  
  // Notes
  notes: String,
  termsConditions: String,
  internalNotes: String,
  
  // GRN references
  grns: [{ type: Schema.Types.ObjectId, ref: 'GRN' }],
  
  // Attachments
  attachments: [String],
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

purchaseOrderSchema.index({ company: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ company: 1, supplier: 1 });
purchaseOrderSchema.index({ company: 1, status: 1 });
purchaseOrderSchema.index({ company: 1, orderDate: -1 });

// GRN (Goods Receipt Note)
const grnSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  
  grnNumber: { type: String, required: true },
  receiptDate: { type: Date, default: Date.now },
  
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierInvoiceNumber: String,
  supplierInvoiceDate: Date,
  
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    variant: { type: Schema.Types.ObjectId },
    orderedQty: Number,
    receivedQty: Number,
    rejectedQty: { type: Number, default: 0 },
    acceptedQty: { type: Number, default: 0 },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
    batchNumber: String,
    expiryDate: Date,
    bin: { type: Schema.Types.ObjectId, ref: 'WarehouseBin' },
    purchasePrice: Number,
    notes: String
  }],
  
  status: {
    type: String,
    enum: ['pending', 'received', 'partial', 'rejected'],
    default: 'pending'
  },
  
  notes: String,
  attachments: [String],
  
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

grnSchema.index({ company: 1, grnNumber: 1 }, { unique: true });
grnSchema.index({ company: 1, purchaseOrder: 1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
const GRN = mongoose.model('GRN', grnSchema);

module.exports = { PurchaseOrder, GRN };
