'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const invoiceLineItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: Schema.Types.ObjectId },
  batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
  serials: [{ type: Schema.Types.ObjectId, ref: 'Serial' }],
  
  // Snapshot data
  name: { type: String, required: true },
  sku: String,
  barcode: String,
  hsnCode: String,
  sacCode: String,
  description: String,
  
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  unitName: String,
  
  // Pricing
  mrp: { type: Number, default: 0 },
  sellingPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 }, // %
  discountAmount: { type: Number, default: 0 },
  
  // Tax
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
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
  
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  notes: String
}, { _id: true });

const invoiceSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  // Numbers
  invoiceNumber: { type: String, required: true },
  
  // Type
  invoiceType: {
    type: String,
    enum: ['sale', 'sale_return', 'pos', 'proforma', 'delivery_challan', 'debit_note', 'credit_note'],
    default: 'sale'
  },
  
  // Customer
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  customerGstin: String,
  billingAddress: Schema.Types.Mixed,
  shippingAddress: Schema.Types.Mixed,
  
  // Sales Order reference
  salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  
  // Items
  items: [invoiceLineItemSchema],
  
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
  grandTotal: { type: Number, required: true },
  
  // Payment
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'unpaid'
  },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  dueDate: Date,
  
  // Tax
  isInterState: { type: Boolean, default: false },
  placeOfSupply: String,
  reverseCharge: { type: Boolean, default: false },
  
  // Dates
  invoiceDate: { type: Date, default: Date.now },
  dueDate: Date,
  
  // E-Invoice
  eInvoiceStatus: {
    type: String,
    enum: ['not_applicable', 'pending', 'generated', 'cancelled'],
    default: 'not_applicable'
  },
  irn: String, // Invoice Reference Number
  ackNumber: String,
  ackDate: Date,
  qrCodeData: String,
  ewbNumber: String, // E-Way Bill
  ewbDate: Date,
  
  // POS specific
  isPOS: { type: Boolean, default: false },
  posSessionId: String,
  cashier: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Delivery
  deliveryStatus: {
    type: String,
    enum: ['pending', 'dispatched', 'delivered', 'failed'],
    default: 'pending'
  },
  deliveryDate: Date,
  deliveryProof: String,
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'sent', 'active', 'cancelled', 'void'],
    default: 'active'
  },
  cancelReason: String,
  
  // Notes
  notes: String,
  termsConditions: String,
  
  // Original invoice (for return/credit note)
  originalInvoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  
  // Attachments / PDF
  pdfUrl: String,
  attachments: [String],
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

invoiceSchema.index({ company: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ company: 1, customer: 1 });
invoiceSchema.index({ company: 1, invoiceDate: -1 });
invoiceSchema.index({ company: 1, paymentStatus: 1 });
invoiceSchema.index({ company: 1, invoiceType: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;
