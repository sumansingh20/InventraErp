'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const fraudAlertSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },

  alertType: {
    type: String,
    required: true,
    enum: [
      'duplicate_invoice',
      'duplicate_payment',
      'abnormal_refund',
      'large_discount_without_approval',
      'stock_manipulation',
      'unauthorized_stock_edit',
      'unusual_login',
      'privilege_escalation',
      'mass_deletion',
      'after_hours_transaction',
      'price_override_suspicious',
      'supplier_duplicate',
      'customer_duplicate',
      'imei_duplicate_sale',
      'negative_stock_adjustment',
      'fake_grn',
      'inflated_purchase'
    ]
  },

  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  title: { type: String, required: true },
  description: String,

  // Linked entity
  entityType: String,
  entityId: { type: Schema.Types.ObjectId },
  entityNumber: String,

  // The suspicious user
  suspectedUser: { type: Schema.Types.ObjectId, ref: 'User' },
  suspectedUserName: String,

  // Evidence
  evidence: { type: Schema.Types.Mixed },

  // Status
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'false_positive', 'escalated'],
    default: 'open'
  },

  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  resolutionNotes: String,

  // Detection metadata
  detectedAt: { type: Date, default: Date.now },
  ipAddress: String,
  device: String
}, { timestamps: true });

fraudAlertSchema.index({ company: 1, status: 1, severity: 1 });
fraudAlertSchema.index({ company: 1, alertType: 1 });
fraudAlertSchema.index({ company: 1, detectedAt: -1 });

const FraudAlert = mongoose.model('FraudAlert', fraudAlertSchema);
module.exports = FraudAlert;
