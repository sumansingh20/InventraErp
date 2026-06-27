'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const automationLogSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  rule: { type: Schema.Types.ObjectId, ref: 'WorkflowRule' },
  ruleName: String,

  // What triggered it
  triggerEvent: String,
  triggerEntityType: String,
  triggerEntityId: { type: Schema.Types.ObjectId },

  // What action was taken
  actionType: String,
  actionParams: { type: Schema.Types.Mixed },
  result: { type: Schema.Types.Mixed }, // result of the action (e.g., created PO id)

  // Status
  status: {
    type: String,
    enum: ['pending', 'running', 'success', 'failed', 'skipped', 'approval_required'],
    default: 'pending'
  },
  errorMessage: String,
  executionTimeMs: Number,

  // Approval (if required)
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'] },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,

  executedAt: { type: Date, default: Date.now }
}, { timestamps: true });

automationLogSchema.index({ company: 1, createdAt: -1 });
automationLogSchema.index({ company: 1, rule: 1, createdAt: -1 });
automationLogSchema.index({ company: 1, status: 1 });

const AutomationLog = mongoose.model('AutomationLog', automationLogSchema);
module.exports = AutomationLog;
