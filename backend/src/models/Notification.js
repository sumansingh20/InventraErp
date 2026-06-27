'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Notification
const notificationSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company' },
  
  recipients: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    isRead: { type: Boolean, default: false },
    readAt: Date
  }],
  
  // For broadcast
  isBroadcast: { type: Boolean, default: false },
  broadcastTo: [String], // roles
  
  type: {
    type: String,
    enum: [
      'stock_alert', 'low_stock', 'out_of_stock', 'expiry_alert',
      'payment_received', 'payment_due', 'invoice_created', 'invoice_due',
      'purchase_order', 'grn_created',
      'sales_order', 'order_fulfilled',
      'lead_assigned', 'opportunity_updated',
      'employee_birthday', 'leave_request', 'payroll_processed',
      'work_order', 'production_complete',
      'system', 'custom'
    ]
  },
  
  title: { type: String, required: true },
  message: { type: String, required: true },
  
  channel: [{ type: String, enum: ['in_app', 'email', 'sms', 'push', 'whatsapp'] }],
  
  // Priority
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  
  // Reference
  referenceType: String,
  referenceId: { type: Schema.Types.ObjectId },
  
  // Action link
  actionUrl: String,
  
  // Status
  isSent: { type: Boolean, default: false },
  sentAt: Date,
  
  // Expiry
  expiresAt: Date,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

notificationSchema.index({ 'recipients.user': 1, 'recipients.isRead': 1 });
notificationSchema.index({ company: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

// Audit Log (tamper-evident)
const auditLogSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company' },
  
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  userEmail: String,
  userRole: String,
  
  action: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'approve', 'reject', 'print', 'cancel'],
    required: true
  },
  
  module: String, // 'inventory', 'sales', etc.
  entity: String, // 'Product', 'Invoice', etc.
  entityId: { type: Schema.Types.ObjectId },
  entityName: String,
  
  // Changes (before/after)
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  changes: [{ field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
  
  // Context
  ip: String,
  userAgent: String,
  device: String,
  location: { lat: Number, lng: Number, city: String },
  
  // Status
  success: { type: Boolean, default: true },
  errorMessage: String,
  
  // Checksum (for tamper detection)
  checksum: String
}, {
  timestamps: true,
  strict: true
});

auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ company: 1, user: 1 });
auditLogSchema.index({ company: 1, module: 1, action: 1 });
auditLogSchema.index({ entityId: 1, entity: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// System-wide settings / Subscription Plans
const subscriptionPlanSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  description: String,
  
  price: {
    monthly: { type: Number, default: 0 },
    quarterly: { type: Number, default: 0 },
    yearly: { type: Number, default: 0 }
  },
  
  features: [String],
  limits: {
    users: { type: Number, default: 5 },
    companies: { type: Number, default: 1 },
    branches: { type: Number, default: 1 },
    warehouses: { type: Number, default: 1 },
    products: { type: Number, default: 1000 },
    invoicesPerMonth: { type: Number, default: 500 },
    storage: { type: Number, default: 1024 } // MB
  },
  
  modules: [String], // Enabled modules
  
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  isFree: { type: Boolean, default: false },
  
  trialDays: { type: Number, default: 14 },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

// Company Subscription
const subscriptionSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  
  status: { type: String, enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'], default: 'trial' },
  
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
  
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  trialEndDate: Date,
  
  amount: { type: Number, default: 0 },
  
  autoRenew: { type: Boolean, default: true },
  
  lastPaymentDate: Date,
  lastPaymentAmount: Number,
  nextBillingDate: Date,
  
  cancelledAt: Date,
  cancelReason: String,
  
  // Payment gateway subscription ID
  gatewaySubscriptionId: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

subscriptionSchema.index({ company: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

// Expense
const expenseSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  expenseNumber: String,
  expenseDate: { type: Date, default: Date.now },
  
  category: { type: String, required: true }, // 'travel', 'utilities', 'salary', etc.
  description: { type: String, required: true },
  
  amount: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  
  paymentMode: { type: String, enum: ['cash', 'bank', 'card', 'upi', 'other'] },
  paidTo: String,
  
  account: { type: Schema.Types.ObjectId, ref: 'Account' },
  
  billable: { type: Boolean, default: false },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  
  attachments: [String],
  
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'paid' },
  
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

expenseSchema.index({ company: 1, expenseDate: -1 });
expenseSchema.index({ company: 1, category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);

// Service Ticket
const serviceTicketSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  ticketNumber: { type: String, required: true },
  
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  customerPhone: String,
  
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: String,
  serialNumber: String,
  
  title: { type: String, required: true },
  description: String,
  
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  
  status: {
    type: String,
    enum: ['open', 'assigned', 'in_progress', 'pending_parts', 'resolved', 'closed', 'cancelled'],
    default: 'open'
  },
  
  category: String, // warranty, amc, repair, installation
  
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  
  scheduledDate: Date,
  resolvedAt: Date,
  
  resolution: String,
  
  // Cost
  laborCharge: { type: Number, default: 0 },
  partsCharge: { type: Number, default: 0 },
  totalCharge: { type: Number, default: 0 },
  
  // Parts used
  partsUsed: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number
  }],
  
  rating: { type: Number, min: 1, max: 5 },
  feedback: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

serviceTicketSchema.index({ company: 1, ticketNumber: 1 }, { unique: true });
serviceTicketSchema.index({ company: 1, status: 1 });
serviceTicketSchema.index({ company: 1, customer: 1 });

const ServiceTicket = mongoose.model('ServiceTicket', serviceTicketSchema);

module.exports = { Notification, AuditLog, SubscriptionPlan, Subscription, Expense, ServiceTicket };
