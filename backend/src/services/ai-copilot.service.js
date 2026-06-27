'use strict';

const logger = require('../config/logger');

/**
 * AI BUSINESS COPILOT
 * Answers natural language questions using real ERP data.
 * Uses rule-based NLP intent matching — no external API required.
 */

const INTENTS = [
  {
    patterns: ['best sell', 'top sell', 'most sold', 'popular product', 'highest sales', 'best product'],
    intent: 'best_selling_products'
  },
  {
    patterns: ['low stock', 'running out', 'reorder', 'stock alert', 'below reorder'],
    intent: 'low_stock_products'
  },
  {
    patterns: ['dead stock', 'not selling', 'slow mover', 'no sale', 'not moved'],
    intent: 'dead_stock'
  },
  {
    patterns: ['best supplier', 'top supplier', 'supplier rank', 'supplier performance'],
    intent: 'best_supplier'
  },
  {
    patterns: ['unpaid invoice', 'overdue', 'pending payment', 'outstanding', 'dues'],
    intent: 'unpaid_invoices'
  },
  {
    patterns: ['profit', 'revenue', 'earning', 'income', 'margin'],
    intent: 'profit_analysis'
  },
  {
    patterns: ['cash flow', 'cash position', 'money available', 'liquid'],
    intent: 'cash_flow'
  },
  {
    patterns: ['top customer', 'best customer', 'highest spend', 'most purchase', 'vip customer'],
    intent: 'top_customers'
  },
  {
    patterns: ['predict', 'forecast', 'next month', 'future sale', 'expected revenue'],
    intent: 'sales_forecast'
  },
  {
    patterns: ['branch performance', 'best branch', 'top branch', 'branch comparison'],
    intent: 'branch_performance'
  },
  {
    patterns: ['expir', 'near expiry', 'expire soon', 'batch expiry'],
    intent: 'expiring_stock'
  },
  {
    patterns: ['churn', 'inactive customer', 'lost customer', 'customer not buying'],
    intent: 'customer_churn'
  },
  {
    patterns: ['warehouse', 'bin', 'shelf', 'where is product', 'product location'],
    intent: 'product_location'
  },
  {
    patterns: ['employee attendance', 'who is present', 'absent today'],
    intent: 'employee_attendance'
  }
];

/**
 * Detect intent from natural language query
 */
const detectIntent = (query) => {
  const q = query.toLowerCase();
  for (const { patterns, intent } of INTENTS) {
    if (patterns.some(p => q.includes(p))) {
      return intent;
    }
  }
  return 'unknown';
};

/**
 * Main entry point — answer a user query
 */
exports.answerQuery = async (query, companyId) => {
  const intent = detectIntent(query);
  logger.info(`AI Copilot: intent=${intent} for query="${query}"`);

  const handlers = {
    best_selling_products: () => exports.getBestSellingProducts(companyId),
    low_stock_products: () => exports.getLowStockProducts(companyId),
    dead_stock: () => exports.getDeadStock(companyId),
    best_supplier: () => exports.getBestSuppliers(companyId),
    unpaid_invoices: () => exports.getUnpaidInvoices(companyId),
    profit_analysis: () => exports.getProfitSummary(companyId),
    cash_flow: () => exports.getCashFlowSummary(companyId),
    top_customers: () => exports.getTopCustomers(companyId),
    sales_forecast: () => exports.getSalesForecastSummary(companyId),
    branch_performance: () => exports.getBranchPerformance(companyId),
    expiring_stock: () => exports.getExpiringStock(companyId),
    customer_churn: () => exports.getChurnRiskCustomers(companyId),
    employee_attendance: () => exports.getTodayAttendance(companyId),
    unknown: () => ({
      answer: "I couldn't understand your question. Try asking about: sales, stock, customers, invoices, profits, forecasts, suppliers, or branches.",
      intent: 'unknown',
      data: null
    })
  };

  try {
    const result = await (handlers[intent] || handlers.unknown)();
    return { query, intent, ...result };
  } catch (err) {
    logger.error('AI Copilot error:', err);
    return { query, intent, answer: 'An error occurred while processing your query.', data: null };
  }
};

exports.getBestSellingProducts = async (companyId) => {
  const { StockMovement } = require('../models/Inventory');
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const data = await StockMovement.aggregate([
    { $match: { company: companyId, movementType: { $in: ['sale', 'pos_sale'] }, createdAt: { $gte: from } } },
    { $group: { _id: '$product', totalSold: { $sum: '$quantity' }, totalRevenue: { $sum: '$totalValue' } } },
    { $sort: { totalSold: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
  ]);

  const topProduct = data[0];
  return {
    answer: topProduct
      ? `Top selling product (last 30 days): **${topProduct.product?.name}** with ${topProduct.totalSold} units sold, generating ₹${topProduct.totalRevenue?.toFixed(2)} in revenue.`
      : 'No sales data found for the last 30 days.',
    data: data.map(d => ({ name: d.product?.name, sku: d.product?.sku, totalSold: d.totalSold, revenue: d.totalRevenue }))
  };
};

exports.getLowStockProducts = async (companyId) => {
  const { Inventory } = require('../models/Inventory');
  const data = await Inventory.find({
    company: companyId,
    reorderLevel: { $gt: 0 },
    $expr: { $lte: ['$quantity', '$reorderLevel'] }
  }).populate('product', 'name sku').populate('warehouse', 'name').limit(10).lean();

  return {
    answer: data.length
      ? `${data.length} products are at or below reorder level. Top item: **${data[0]?.product?.name}** (${data[0]?.quantity} remaining, reorder at ${data[0]?.reorderLevel}).`
      : 'All products are above reorder levels.',
    data: data.map(d => ({ product: d.product?.name, sku: d.product?.sku, qty: d.quantity, reorderLevel: d.reorderLevel, warehouse: d.warehouse?.name }))
  };
};

exports.getDeadStock = async (companyId) => {
  const automationService = require('./automation.service');
  const insight = await automationService.identifyDeadStock(companyId, 90);
  const count = insight.data?.totalProducts || 0;
  const value = insight.data?.totalValue || 0;
  return {
    answer: count
      ? `${count} products are dead stock (no sales in 90+ days), tying up ₹${value.toFixed(2)} in capital.`
      : 'No dead stock detected in the last 90 days.',
    data: insight.data?.products || []
  };
};

exports.getBestSuppliers = async (companyId) => {
  const automationService = require('./automation.service');
  const insight = await automationService.rankSuppliers(companyId);
  const top = insight.data?.rankings?.[0];
  return {
    answer: top
      ? `Top supplier by purchase value with ${top.totalOrders} orders placed.`
      : 'No supplier data available.',
    data: insight.data?.rankings || []
  };
};

exports.getUnpaidInvoices = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const data = await Invoice.aggregate([
    { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$balanceDue' } } }
  ]);
  const totalDue = data.reduce((sum, d) => sum + d.total, 0);
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  return {
    answer: totalCount
      ? `${totalCount} unpaid/overdue invoices totaling **₹${totalDue.toFixed(2)}** pending collection.`
      : 'All invoices are fully paid.',
    data
  };
};

exports.getProfitSummary = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const revenue = await Invoice.aggregate([
    { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
  ]);

  const total = revenue[0]?.total || 0;
  return {
    answer: `In the last 30 days, total invoiced revenue is **₹${total.toFixed(2)}** across ${revenue[0]?.count || 0} invoices.`,
    data: { revenue: total, invoiceCount: revenue[0]?.count || 0 }
  };
};

exports.getCashFlowSummary = async (companyId) => {
  const automationService = require('./automation.service');
  const insight = await automationService.generateCashFlowForecast(companyId);
  return {
    answer: `${insight.summary} ${insight.recommendation}`,
    data: insight.data
  };
};

exports.getTopCustomers = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const from = new Date();
  from.setDate(from.getDate() - 90);

  const data = await Invoice.aggregate([
    { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
    { $group: { _id: '$customer', customerName: { $first: '$customerName' }, totalSpend: { $sum: '$grandTotal' }, invoiceCount: { $sum: 1 } } },
    { $sort: { totalSpend: -1 } },
    { $limit: 5 }
  ]);

  const top = data[0];
  return {
    answer: top
      ? `Most profitable customer: **${top.customerName}** with ₹${top.totalSpend?.toFixed(2)} spent across ${top.invoiceCount} invoices (last 90 days).`
      : 'No customer sales data found.',
    data
  };
};

exports.getSalesForecastSummary = async (companyId) => {
  const automationService = require('./automation.service');
  const insight = await automationService.generateSalesForecast(companyId, 30);
  const totalForecast = (insight.data?.forecasts || []).reduce((sum, f) => sum + f.forecastRevenue, 0);
  return {
    answer: `Based on current trends, estimated revenue for the next 30 days is **₹${totalForecast.toFixed(2)}**.`,
    data: insight.data?.forecasts?.slice(0, 5) || []
  };
};

exports.getBranchPerformance = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const data = await Invoice.aggregate([
    { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
    { $group: { _id: '$branch', totalRevenue: { $sum: '$grandTotal' }, invoiceCount: { $sum: 1 } } },
    { $sort: { totalRevenue: -1 } },
    { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
    { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } }
  ]);

  const top = data[0];
  return {
    answer: top
      ? `Best performing branch (last 30 days): **${top.branch?.name || 'Main Branch'}** with ₹${top.totalRevenue?.toFixed(2)} revenue.`
      : 'No branch-level data available.',
    data: data.map(d => ({ branch: d.branch?.name, revenue: d.totalRevenue, invoices: d.invoiceCount }))
  };
};

exports.getExpiringStock = async (companyId) => {
  const { Batch } = require('../models/Inventory');
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 30);
  const data = await Batch.find({
    company: companyId,
    expiryDate: { $lte: threshold, $gt: new Date() },
    isExpired: false,
    quantity: { $gt: 0 }
  }).populate('product', 'name').limit(10).lean();

  return {
    answer: data.length
      ? `${data.length} batches are expiring within 30 days. Immediate action recommended.`
      : 'No stock expiring in the next 30 days.',
    data: data.map(d => ({ product: d.product?.name, batch: d.batchNumber, qty: d.quantity, expiry: d.expiryDate }))
  };
};

exports.getChurnRiskCustomers = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 90);
  const recentCustomers = await Invoice.distinct('customer', { company: companyId, createdAt: { $gte: threshold } });
  const Customer = require('../models/Customer');
  const churnRisk = await Customer.find({
    company: companyId,
    isActive: true,
    _id: { $nin: recentCustomers }
  }).select('name phone email').limit(10).lean();

  return {
    answer: churnRisk.length
      ? `${churnRisk.length} customers haven't purchased in 90+ days and are at churn risk.`
      : 'All customers are recently active — no churn risk detected.',
    data: churnRisk
  };
};

exports.getTodayAttendance = async (companyId) => {
  const { Attendance } = require('../models/Employee');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const data = await Attendance.aggregate([
    { $match: { company: companyId, date: { $gte: today } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const present = data.find(d => d._id === 'present')?.count || 0;
  const absent = data.find(d => d._id === 'absent')?.count || 0;
  return {
    answer: `Today's attendance: **${present}** present, **${absent}** absent.`,
    data
  };
};
