'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Lead
const leadSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  // Lead Info
  leadNumber: String,
  name: { type: String, required: true },
  companyName: String,
  email: String,
  phone: String,
  website: String,
  
  // Source
  source: {
    type: String,
    enum: ['website', 'referral', 'social_media', 'email', 'call', 'walk_in', 'trade_show', 'advertisement', 'other'],
    default: 'other'
  },
  
  // Classification
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'],
    default: 'new'
  },
  
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  
  // Value
  estimatedValue: { type: Number, default: 0 },
  
  // Assignment
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Address
  city: String,
  state: String,
  country: String,
  
  // Notes
  description: String,
  notes: String,
  tags: [String],
  
  // Activity
  nextFollowUp: Date,
  lastContactDate: Date,
  
  // Conversion
  convertedAt: Date,
  convertedTo: { type: Schema.Types.ObjectId, ref: 'Customer' },
  opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity' },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leadSchema.index({ company: 1, status: 1 });
leadSchema.index({ company: 1, assignedTo: 1 });
leadSchema.index({ company: 1, name: 'text', email: 'text', phone: 'text' });

const Lead = mongoose.model('Lead', leadSchema);

// Opportunity
const opportunitySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  opportunityNumber: String,
  name: { type: String, required: true },
  
  // Customer
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  lead: { type: Schema.Types.ObjectId, ref: 'Lead' },
  
  // Sales Info
  stage: {
    type: String,
    enum: ['qualification', 'needs_analysis', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
    default: 'qualification'
  },
  
  probability: { type: Number, default: 10 }, // 0-100%
  
  expectedRevenue: { type: Number, default: 0 },
  actualRevenue: { type: Number, default: 0 },
  
  closeDate: Date,
  
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  
  description: String,
  lostReason: String,
  
  // Products of interest
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  
  // Related
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

opportunitySchema.index({ company: 1, stage: 1 });
opportunitySchema.index({ company: 1, customer: 1 });

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

// Quotation
const quotationSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  quotationNumber: { type: String, required: true },
  
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity' },
  
  validUntil: Date,
  
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    sku: String,
    quantity: Number,
    unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
    sellingPrice: Number,
    discount: Number,
    taxRate: Number,
    total: Number
  }],
  
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
    default: 'draft'
  },
  
  notes: String,
  termsConditions: String,
  
  // Convert to sales order
  salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

quotationSchema.index({ company: 1, quotationNumber: 1 }, { unique: true });

const Quotation = mongoose.model('Quotation', quotationSchema);

// Sales Order
const salesOrderSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  soNumber: { type: String, required: true },
  
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: String,
  
  orderDate: { type: Date, default: Date.now },
  deliveryDate: Date,
  
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    variant: { type: Schema.Types.ObjectId },
    name: String,
    sku: String,
    quantity: Number,
    orderedQty: Number,
    deliveredQty: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },
    unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
    sellingPrice: Number,
    discount: Number,
    discountAmount: Number,
    taxRate: Number,
    taxAmount: Number,
    total: Number,
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' }
  }],
  
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'processing', 'partial', 'fulfilled', 'cancelled'],
    default: 'draft'
  },
  
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  
  // References
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
  invoices: [{ type: Schema.Types.ObjectId, ref: 'Invoice' }],
  
  // Sales person
  salesPerson: { type: Schema.Types.ObjectId, ref: 'User' },
  commission: { type: Number, default: 0 },
  
  notes: String,
  shippingAddress: Schema.Types.Mixed,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

salesOrderSchema.index({ company: 1, soNumber: 1 }, { unique: true });
salesOrderSchema.index({ company: 1, customer: 1 });
salesOrderSchema.index({ company: 1, status: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

// CRM Activity Log
const activitySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  activityType: {
    type: String,
    enum: ['call', 'meeting', 'email', 'whatsapp', 'sms', 'visit', 'demo', 'proposal', 'follow_up', 'note', 'task'],
    required: true
  },
  
  // What it's related to
  relatedTo: {
    type: String,
    enum: ['lead', 'opportunity', 'customer', 'supplier'],
    required: true
  },
  relatedId: { type: Schema.Types.ObjectId, required: true },
  
  subject: String,
  description: String,
  
  duration: Number, // minutes
  outcome: String,
  
  scheduledAt: Date,
  completedAt: Date,
  
  status: { type: String, enum: ['planned', 'done', 'cancelled'], default: 'planned' },
  
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

activitySchema.index({ company: 1, relatedTo: 1, relatedId: 1 });
activitySchema.index({ company: 1, assignedTo: 1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = { Lead, Opportunity, Quotation, SalesOrder, Activity };
