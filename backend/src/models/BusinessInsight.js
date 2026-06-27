'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const businessInsightSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },

  insightType: {
    type: String,
    required: true,
    enum: [
      'sales_forecast', 'demand_forecast', 'cash_flow_forecast', 'profit_forecast',
      'reorder_suggestion', 'restock_suggestion', 'vendor_suggestion', 'discount_suggestion',
      'dead_stock_alert', 'overstock_alert', 'best_seller', 'slow_mover',
      'customer_churn_risk', 'top_customer', 'supplier_ranking',
      'branch_performance', 'employee_performance',
      'inventory_heatmap', 'warehouse_heatmap', 'demand_anomaly'
    ]
  },

  title: String,
  summary: String,
  recommendation: String,

  // Entity context (what this insight is about)
  entityType: String, // 'Product', 'Customer', 'Supplier', 'Branch'
  entityId: { type: Schema.Types.ObjectId },
  entityName: String,

  // Structured insight data
  data: { type: Schema.Types.Mixed },

  // Confidence score (0-100)
  confidence: { type: Number, default: 0 },
  impact: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  // Period the insight covers
  period: {
    from: Date,
    to: Date,
    label: String // e.g., 'Next 30 Days', 'Last Quarter'
  },

  // Status
  status: { type: String, enum: ['active', 'actioned', 'dismissed', 'expired'], default: 'active' },
  actionedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  actionedAt: Date,

  expiresAt: Date,
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

businessInsightSchema.index({ company: 1, insightType: 1, status: 1 });
businessInsightSchema.index({ company: 1, entityType: 1, entityId: 1 });
businessInsightSchema.index({ company: 1, generatedAt: -1 });

const BusinessInsight = mongoose.model('BusinessInsight', businessInsightSchema);
module.exports = BusinessInsight;
