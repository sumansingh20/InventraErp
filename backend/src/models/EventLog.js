'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Event Sourcing Engine
 * Every mutation in the system is stored as an immutable event.
 * Supports: Time Travel, Rollback, Audit Reconstruction.
 */
const eventLogSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },

  // The entity that changed
  entity: {
    type: String,
    required: true,
    enum: [
      'Product', 'Inventory', 'StockMovement', 'Invoice', 'PurchaseOrder',
      'Payment', 'Customer', 'Supplier', 'Employee', 'User',
      'Warehouse', 'WarehouseZone', 'WarehouseRack', 'WarehouseShelf', 'WarehouseBin',
      'Serial', 'Batch', 'Return', 'ServiceRecord', 'Warranty',
      'Lead', 'Opportunity', 'SalesOrder', 'Quotation',
      'Attendance', 'Leave', 'Payroll',
      'WorkflowRule', 'AutomationLog', 'Asset', 'Delivery', 'Vehicle',
      'Contract', 'Account', 'JournalEntry', 'Company', 'Branch'
    ],
    index: true
  },
  entityId: { type: Schema.Types.ObjectId, required: true, index: true },
  entityNumber: String, // human-readable ref like invoice number, PO number

  // What happened
  eventType: {
    type: String,
    required: true,
    enum: [
      'created', 'updated', 'deleted', 'status_changed', 'approved', 'rejected',
      'stock_in', 'stock_out', 'stock_transferred', 'stock_adjusted',
      'payment_received', 'payment_made', 'payment_reversed',
      'invoice_generated', 'invoice_cancelled', 'invoice_sent',
      'po_created', 'po_approved', 'po_received', 'po_cancelled',
      'employee_joined', 'employee_exited', 'leave_approved', 'payroll_processed',
      'warranty_claimed', 'service_started', 'service_completed',
      'login', 'logout', 'password_changed', 'role_changed',
      'automation_triggered', 'fraud_detected', 'alert_raised',
      'batch_expired', 'serial_sold', 'serial_returned', 'imei_duplicate_detected'
    ],
    index: true
  },

  // Snapshot of data before/after
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },

  // Changed fields (for quick diff)
  changedFields: [String],

  // Who did it
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  performedByName: String,
  performedByRole: String,

  // Where / Device
  ipAddress: String,
  userAgent: String,
  device: String,
  browser: String,
  location: {
    lat: Number,
    lng: Number,
    city: String,
    country: String
  },

  // Context
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  module: String, // e.g., 'pos', 'inventory', 'purchase'
  actionSource: {
    type: String,
    enum: ['web', 'mobile', 'api', 'automation', 'cron', 'import', 'webhook'],
    default: 'web'
  },

  // Description for human-readable audit trail
  description: String,

  // Severity for important events
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },

  // Metadata / extra context
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  // Capped collection option — for ultra-high volume, consider capping at 10GB
});

// Indexes for efficient time-travel & audit queries
eventLogSchema.index({ company: 1, entity: 1, entityId: 1, createdAt: -1 });
eventLogSchema.index({ company: 1, performedBy: 1, createdAt: -1 });
eventLogSchema.index({ company: 1, eventType: 1, createdAt: -1 });
eventLogSchema.index({ company: 1, severity: 1, createdAt: -1 });
eventLogSchema.index({ createdAt: -1 }); // global time-travel queries

const EventLog = mongoose.model('EventLog', eventLogSchema);
module.exports = EventLog;
