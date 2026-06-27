'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Enterprise Workflow Rule Engine
 * Admin creates rules: "If X happens → Do Y"
 * No coding required.
 */

const conditionSchema = new Schema({
  field: { type: String, required: true },       // e.g., 'inventory.quantity', 'invoice.grandTotal'
  operator: {
    type: String,
    required: true,
    enum: ['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'is_null', 'is_not_null', 'days_until', 'days_since']
  },
  value: { type: Schema.Types.Mixed },           // comparison value
  valueType: { type: String, enum: ['static', 'field', 'formula'], default: 'static' }
}, { _id: false });

const actionSchema = new Schema({
  actionType: {
    type: String,
    required: true,
    enum: [
      'create_purchase_order',
      'create_stock_transfer',
      'create_reorder_request',
      'send_notification',
      'send_email',
      'send_sms',
      'send_whatsapp',
      'create_task',
      'create_ticket',
      'require_approval',
      'escalate_to',
      'update_field',
      'apply_discount',
      'apply_price_change',
      'block_transaction',
      'flag_for_review',
      'generate_report',
      'webhook_call',
      'create_alert'
    ]
  },
  params: { type: Schema.Types.Mixed }, // e.g., { reorderQty: 50, supplierId: '...' }
  delayMinutes: { type: Number, default: 0 }, // delay before firing action
}, { _id: false });

const workflowRuleSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },

  name: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['inventory', 'sales', 'purchase', 'accounting', 'crm', 'hrms', 'warehouse', 'compliance', 'fraud', 'custom'],
    default: 'custom'
  },

  // Trigger: what starts the rule
  trigger: {
    event: {
      type: String,
      required: true,
      enum: [
        // Inventory triggers
        'stock_below_reorder', 'stock_zero', 'stock_above_max', 'batch_expiry_approaching', 'batch_expired',
        // Sales triggers
        'invoice_created', 'invoice_overdue', 'payment_received', 'payment_overdue', 'large_sale',
        // Purchase triggers
        'po_created', 'po_overdue', 'grn_completed', 'supplier_invoice_received',
        // Customer triggers
        'customer_created', 'customer_inactive_days', 'customer_credit_limit_breach',
        // System triggers
        'scheduled_daily', 'scheduled_weekly', 'scheduled_monthly',
        // Warehouse triggers
        'warehouse_capacity_exceeded', 'product_not_in_bin',
        // HR triggers
        'leave_pending_approval', 'payroll_due',
        // Finance triggers
        'expense_exceeds_budget', 'cash_flow_negative',
        // Fraud triggers
        'duplicate_invoice_detected', 'abnormal_discount_applied', 'unauthorized_stock_edit'
      ]
    },
    schedule: String, // cron expression for scheduled triggers
    conditions: [conditionSchema] // additional filter conditions
  },

  // Actions to fire when rule triggers
  actions: [actionSchema],

  // Approval before action (multi-level)
  requiresApproval: { type: Boolean, default: false },
  approvalRoles: [String], // roles that can approve

  // Rule settings
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 5 }, // 1 (highest) to 10 (lowest)
  maxFires: { type: Number, default: 0 }, // 0 = unlimited
  fireCount: { type: Number, default: 0 },
  cooldownMinutes: { type: Number, default: 0 }, // prevent re-firing

  lastFiredAt: Date,
  nextFireAt: Date,

  // Stats
  totalFires: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

workflowRuleSchema.index({ company: 1, isActive: 1, 'trigger.event': 1 });
workflowRuleSchema.index({ company: 1, category: 1 });

const WorkflowRule = mongoose.model('WorkflowRule', workflowRuleSchema);
module.exports = WorkflowRule;
