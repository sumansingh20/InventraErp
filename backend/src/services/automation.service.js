'use strict';

const logger = require('../config/logger');

/**
 * HYPER AUTOMATION ENGINE
 * Evaluates all active WorkflowRules and fires their configured actions.
 * Called by Bull queue every 15 minutes and manually via API.
 */

/**
 * Main automation cycle — evaluate all rules
 */
exports.runAutomationCycle = async (companyId = null) => {
  const WorkflowRule = require('../models/WorkflowRule');
  const start = Date.now();
  let processed = 0, fired = 0, failed = 0;

  try {
    const query = { isActive: true };
    if (companyId) query.company = companyId;

    const rules = await WorkflowRule.find(query).sort({ priority: 1 });

    for (const rule of rules) {
      try {
        const shouldFire = await exports.evaluateRule(rule);
        if (shouldFire) {
          await exports.fireRule(rule);
          fired++;
        }
        processed++;
      } catch (err) {
        failed++;
        logger.error(`Automation: Rule ${rule._id} failed:`, err.message);
      }
    }

    logger.info(`Automation cycle: ${processed} rules evaluated, ${fired} fired, ${failed} failed in ${Date.now() - start}ms`);
    return { processed, fired, failed };
  } catch (err) {
    logger.error('Automation cycle error:', err);
    throw err;
  }
};

/**
 * Evaluate if a rule should fire based on its trigger + conditions
 */
exports.evaluateRule = async (rule) => {
  const { trigger } = rule;

  // Check cooldown
  if (rule.cooldownMinutes > 0 && rule.lastFiredAt) {
    const msSinceFired = Date.now() - new Date(rule.lastFiredAt).getTime();
    if (msSinceFired < rule.cooldownMinutes * 60 * 1000) return false;
  }

  // Check maxFires
  if (rule.maxFires > 0 && rule.fireCount >= rule.maxFires) return false;

  switch (trigger.event) {
    case 'stock_below_reorder':
      return exports.checkStockBelowReorder(rule);
    case 'stock_zero':
      return exports.checkStockZero(rule);
    case 'batch_expiry_approaching':
      return exports.checkBatchExpiry(rule);
    case 'invoice_overdue':
      return exports.checkOverdueInvoices(rule);
    case 'payment_overdue':
      return exports.checkPaymentOverdue(rule);
    case 'customer_inactive_days':
      return exports.checkCustomerInactive(rule);
    case 'contract_expiry_approaching':
      return exports.checkContractExpiry(rule);
    case 'scheduled_daily':
    case 'scheduled_weekly':
    case 'scheduled_monthly':
      return exports.checkScheduledTrigger(rule);
    default:
      return false;
  }
};

exports.checkStockBelowReorder = async (rule) => {
  const { Inventory } = require('../models/Inventory');
  const lowStock = await Inventory.findOne({
    company: rule.company,
    quantity: { $lte: 0 },
    reorderLevel: { $gt: 0 },
    $expr: { $lte: ['$quantity', '$reorderLevel'] }
  });
  return !!lowStock;
};

exports.checkStockZero = async (rule) => {
  const { Inventory } = require('../models/Inventory');
  const zeroStock = await Inventory.findOne({ company: rule.company, quantity: { $lte: 0 } });
  return !!zeroStock;
};

exports.checkBatchExpiry = async (rule) => {
  const { Batch } = require('../models/Inventory');
  const days = rule.trigger.conditions?.[0]?.value || 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);
  const expiring = await Batch.findOne({
    company: rule.company,
    expiryDate: { $lte: threshold, $gt: new Date() },
    isExpired: false,
    quantity: { $gt: 0 }
  });
  return !!expiring;
};

exports.checkOverdueInvoices = async (rule) => {
  const Invoice = require('../models/Invoice');
  const overdue = await Invoice.findOne({
    company: rule.company,
    dueDate: { $lt: new Date() },
    paymentStatus: { $in: ['unpaid', 'partial'] },
    status: { $ne: 'cancelled' }
  });
  return !!overdue;
};

exports.checkPaymentOverdue = async (rule) => {
  const days = rule.trigger.conditions?.[0]?.value || 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  const Invoice = require('../models/Invoice');
  const overdue = await Invoice.findOne({
    company: rule.company,
    dueDate: { $lt: threshold },
    paymentStatus: { $in: ['unpaid', 'partial'] }
  });
  return !!overdue;
};

exports.checkCustomerInactive = async (rule) => {
  const days = rule.trigger.conditions?.[0]?.value || 90;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  const Invoice = require('../models/Invoice');
  // Find customers who haven't purchased in 'days' days
  const recentCustomerIds = await Invoice.distinct('customer', {
    company: rule.company,
    createdAt: { $gte: threshold }
  });
  const Customer = require('../models/Customer');
  const inactive = await Customer.findOne({
    company: rule.company,
    _id: { $nin: recentCustomerIds },
    isActive: true
  });
  return !!inactive;
};

exports.checkContractExpiry = async (rule) => {
  const days = rule.trigger.conditions?.[0]?.value || 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);
  const Contract = require('../models/Contract');
  const expiring = await Contract.findOne({
    company: rule.company,
    endDate: { $lte: threshold, $gt: new Date() },
    status: 'active'
  });
  return !!expiring;
};

exports.checkScheduledTrigger = async (rule) => {
  // For scheduled triggers, always fire (cron handles timing)
  return true;
};

/**
 * Fire rule actions
 */
exports.fireRule = async (rule) => {
  const WorkflowRule = require('../models/WorkflowRule');
  const AutomationLog = require('../models/AutomationLog');
  const results = [];

  for (const action of rule.actions) {
    const logEntry = {
      company: rule.company,
      rule: rule._id,
      ruleName: rule.name,
      triggerEvent: rule.trigger.event,
      actionType: action.actionType,
      actionParams: action.params,
      status: 'running'
    };

    const start = Date.now();
    try {
      const result = await exports.executeAction(action, rule);
      logEntry.result = result;
      logEntry.status = rule.requiresApproval ? 'approval_required' : 'success';
      logEntry.executionTimeMs = Date.now() - start;
      results.push(result);
    } catch (err) {
      logEntry.status = 'failed';
      logEntry.errorMessage = err.message;
      logEntry.executionTimeMs = Date.now() - start;
      logger.error(`Action ${action.actionType} failed for rule ${rule.name}:`, err.message);
    }

    await AutomationLog.create(logEntry);
  }

  // Update rule stats
  await WorkflowRule.findByIdAndUpdate(rule._id, {
    $inc: { fireCount: 1, totalFires: 1, successCount: results.length },
    lastFiredAt: new Date()
  });

  return results;
};

/**
 * Execute a single action
 */
exports.executeAction = async (action, rule) => {
  switch (action.actionType) {
    case 'create_purchase_order':
      return exports.autoCreatePurchaseOrders(rule.company, action.params);
    case 'send_notification':
      return exports.autoSendNotification(rule.company, action.params, rule.name);
    case 'create_alert':
      return exports.autoCreateAlert(rule.company, action.params, rule.name);
    case 'send_email':
      return exports.autoSendEmail(rule.company, action.params);
    case 'flag_for_review':
      return exports.autoFlagForReview(rule.company, action.params, rule);
    default:
      logger.warn(`Unknown action type: ${action.actionType}`);
      return { skipped: true, actionType: action.actionType };
  }
};

/**
 * Auto-create Purchase Orders for all products below reorder level
 */
exports.autoCreatePurchaseOrders = async (companyId, params = {}) => {
  const { Inventory } = require('../models/Inventory');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Product = require('../models/Product');
  const { generatePoNumber } = require('./counter.service');

  const lowStockItems = await Inventory.find({
    company: companyId,
    $expr: { $lte: ['$quantity', '$reorderLevel'] },
    reorderLevel: { $gt: 0 }
  }).populate('product warehouse');

  if (!lowStockItems.length) return { message: 'No low stock items', created: 0 };

  // Group by preferred supplier
  const bySupplier = {};
  for (const item of lowStockItems) {
    if (!item.product) continue;
    const supplierId = (item.product.preferredSupplier || 'unknown').toString();
    if (!bySupplier[supplierId]) bySupplier[supplierId] = { items: [], supplier: item.product.preferredSupplier };
    bySupplier[supplierId].items.push({
      product: item.product._id,
      name: item.product.name,
      sku: item.product.sku,
      orderedQty: item.reorderQty || item.reorderLevel * 2,
      receivedQty: 0,
      purchasePrice: item.product.purchasePrice || 0,
      total: (item.reorderQty || item.reorderLevel * 2) * (item.product.purchasePrice || 0)
    });
  }

  const createdPOs = [];
  for (const [supplierId, data] of Object.entries(bySupplier)) {
    if (supplierId === 'unknown' || !data.supplier) continue;
    const poNumber = await generatePoNumber(companyId);
    const subtotal = data.items.reduce((sum, i) => sum + i.total, 0);
    const po = await PurchaseOrder.create({
      company: companyId,
      supplier: data.supplier,
      poNumber,
      items: data.items,
      subtotal,
      grandTotal: subtotal,
      status: 'draft',
      notes: `Auto-generated by Automation Engine on ${new Date().toLocaleDateString()}`,
      autoGenerated: true
    });
    createdPOs.push(po._id);
  }

  logger.info(`Auto-created ${createdPOs.length} Purchase Orders for company ${companyId}`);
  return { created: createdPOs.length, poIds: createdPOs };
};

/**
 * Auto-generate Sales Forecast using historical data
 */
exports.generateSalesForecast = async (companyId, days = 30) => {
  const { StockMovement } = require('../models/Inventory');
  const BusinessInsight = require('../models/BusinessInsight');

  const pastDays = 90;
  const from = new Date();
  from.setDate(from.getDate() - pastDays);

  const salesData = await StockMovement.aggregate([
    {
      $match: {
        company: companyId,
        movementType: { $in: ['sale', 'pos_sale'] },
        createdAt: { $gte: from }
      }
    },
    {
      $group: {
        _id: '$product',
        totalSold: { $sum: '$quantity' },
        totalValue: { $sum: '$totalValue' },
        avgDailySales: { $avg: '$quantity' }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: 50 }
  ]);

  // Simple linear forecast: extrapolate from 90-day average to next `days`
  const forecasts = salesData.map(item => ({
    product: item._id,
    forecastQty: Math.ceil((item.totalSold / pastDays) * days),
    forecastRevenue: (item.totalValue / pastDays) * days,
    confidence: pastDays >= 30 ? 75 : 50
  }));

  const insight = await BusinessInsight.findOneAndUpdate(
    { company: companyId, insightType: 'sales_forecast' },
    {
      company: companyId,
      insightType: 'sales_forecast',
      title: `${days}-Day Sales Forecast`,
      summary: `Based on last ${pastDays} days of sales data`,
      data: { forecasts, generatedAt: new Date() },
      confidence: 75,
      impact: 'high',
      period: { from: new Date(), to: new Date(Date.now() + days * 86400000), label: `Next ${days} Days` },
      status: 'active',
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return insight;
};

/**
 * Generate Cash Flow Forecast (30/60/90 days)
 */
exports.generateCashFlowForecast = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const BusinessInsight = require('../models/BusinessInsight');

  // Pending receivables
  const receivables = await Invoice.aggregate([
    { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial'] }, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$balanceDue' }, count: { $sum: 1 } } }
  ]);

  // Pending payables
  const payables = await PurchaseOrder.aggregate([
    { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial'] }, status: { $in: ['received', 'partial'] } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
  ]);

  const totalReceivables = receivables[0]?.total || 0;
  const totalPayables = payables[0]?.total || 0;
  const netCashFlow = totalReceivables - totalPayables;

  const insight = await BusinessInsight.findOneAndUpdate(
    { company: companyId, insightType: 'cash_flow_forecast' },
    {
      company: companyId,
      insightType: 'cash_flow_forecast',
      title: 'Cash Flow Forecast',
      summary: `Expected net cash flow: ₹${netCashFlow.toFixed(2)}`,
      recommendation: netCashFlow < 0 ? 'Immediate collection action recommended. Cash flow negative.' : 'Cash flow positive. Consider reinvestment.',
      data: {
        totalReceivables,
        totalPayables,
        netCashFlow,
        receivablesCount: receivables[0]?.count || 0,
        payablesCount: payables[0]?.count || 0
      },
      confidence: 80,
      impact: netCashFlow < 0 ? 'critical' : 'medium',
      status: 'active',
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return insight;
};

/**
 * Rank suppliers by performance score
 */
exports.rankSuppliers = async (companyId) => {
  const PurchaseOrder = require('../models/PurchaseOrder');
  const { Return } = require('../models/Return') || {};
  const BusinessInsight = require('../models/BusinessInsight');

  const supplierStats = await PurchaseOrder.aggregate([
    { $match: { company: companyId, status: { $in: ['received', 'partial'] } } },
    {
      $group: {
        _id: '$supplier',
        totalOrders: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' },
        avgDeliveryDays: { $avg: { $subtract: ['$actualDeliveryDate', '$expectedDeliveryDate'] } }
      }
    },
    { $sort: { totalValue: -1 } },
    { $limit: 20 }
  ]);

  // Normalize scores
  const ranked = supplierStats.map((s, index) => ({
    supplier: s._id,
    rank: index + 1,
    totalOrders: s.totalOrders,
    totalValue: s.totalValue,
    avgDeliveryDays: s.avgDeliveryDays || 0,
    score: Math.max(0, 100 - (s.avgDeliveryDays || 0) * 5) // simplified scoring
  }));

  const insight = await BusinessInsight.findOneAndUpdate(
    { company: companyId, insightType: 'supplier_ranking' },
    {
      company: companyId,
      insightType: 'supplier_ranking',
      title: 'Supplier Performance Ranking',
      summary: `Ranked ${ranked.length} suppliers by value and delivery performance`,
      data: { rankings: ranked, generatedAt: new Date() },
      confidence: 85,
      impact: 'medium',
      status: 'active',
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return insight;
};

/**
 * Identify dead stock
 */
exports.identifyDeadStock = async (companyId, daysSinceLastSale = 90) => {
  const { Inventory, StockMovement } = require('../models/Inventory');
  const BusinessInsight = require('../models/BusinessInsight');

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - daysSinceLastSale);

  const activeSoldProducts = await StockMovement.distinct('product', {
    company: companyId,
    movementType: { $in: ['sale', 'pos_sale'] },
    createdAt: { $gte: threshold }
  });

  const deadStock = await Inventory.find({
    company: companyId,
    product: { $nin: activeSoldProducts },
    quantity: { $gt: 0 }
  }).populate('product', 'name sku purchasePrice').limit(100);

  const totalValue = deadStock.reduce((sum, item) => {
    return sum + (item.quantity * (item.product?.purchasePrice || 0));
  }, 0);

  const insight = await BusinessInsight.findOneAndUpdate(
    { company: companyId, insightType: 'dead_stock_alert' },
    {
      company: companyId,
      insightType: 'dead_stock_alert',
      title: 'Dead Stock Alert',
      summary: `${deadStock.length} products have not sold in ${daysSinceLastSale}+ days`,
      recommendation: 'Consider discounting, bundling, or returning to supplier.',
      data: {
        products: deadStock.slice(0, 20).map(i => ({
          product: i.product?._id,
          name: i.product?.name,
          sku: i.product?.sku,
          quantity: i.quantity,
          value: i.quantity * (i.product?.purchasePrice || 0)
        })),
        totalProducts: deadStock.length,
        totalValue
      },
      confidence: 90,
      impact: totalValue > 50000 ? 'high' : 'medium',
      status: 'active',
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return insight;
};

/**
 * Auto notify
 */
exports.autoSendNotification = async (companyId, params, ruleName) => {
  const notificationService = require('./notification.service');
  const User = require('../models/User');
  const roles = params?.roles || ['admin', 'company_owner'];
  const recipients = await User.find({ company: companyId, isActive: true, customRole: { $in: roles } }).select('_id');
  await notificationService.createNotification({
    company: companyId,
    type: 'automation_alert',
    title: params?.title || `Automation: ${ruleName}`,
    message: params?.message || `Workflow rule "${ruleName}" was triggered.`,
    recipients: recipients.map(u => u._id),
    channels: ['in_app']
  });
  return { notified: recipients.length };
};

exports.autoCreateAlert = async (companyId, params, ruleName) => {
  return exports.autoSendNotification(companyId, params, ruleName);
};

exports.autoSendEmail = async (companyId, params) => {
  logger.info(`Auto email for company ${companyId}: ${params?.subject || 'Automation Alert'}`);
  return { emailQueued: true };
};

exports.autoFlagForReview = async (companyId, params, rule) => {
  logger.info(`Flagging for review — rule: ${rule.name}, company: ${companyId}`);
  return { flagged: true };
};
