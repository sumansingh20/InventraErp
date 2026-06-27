'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const { Inventory, StockMovement } = require('../models/Inventory');
const { Employee, Attendance } = require('../models/Employee');
const BusinessInsight = require('../models/BusinessInsight');
const FraudAlert = require('../models/FraudAlert');
const automationService = require('../services/automation.service');

router.use(authenticate);

/**
 * INVENTRA BUSINESS INTELLIGENCE — Role-Based Analytics Dashboards
 * Provides tailored analytics for: CEO, CFO, COO, Inventory Head, Sales Head, Warehouse Head
 */

// ─── Helper: date range ────────────────────────────────────────────────────────
const getDateRange = (period = '30d') => {
  const now = new Date();
  const from = new Date();
  const periods = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  from.setDate(now.getDate() - (periods[period] || 30));
  return { from, to: now };
};

// ─── CEO Dashboard ─────────────────────────────────────────────────────────────
// Metrics: Revenue, Profit, Growth, Top Branches, AI Briefing, Forecast
router.get('/ceo', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { from } = getDateRange(period);
    const companyId = req.user.company;

    const [revenue, prevRevenue, topBranches, topProducts, cashFlow, aiInsights, fraudCount] = await Promise.all([
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, avgOrder: { $avg: '$grandTotal' } } }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: new Date(from.getTime() - (Date.now() - from.getTime())), $lt: from } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: '$branch', revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } }, { $limit: 5 },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } }
      ]),
      StockMovement.aggregate([
        { $match: { company: companyId, movementType: { $in: ['sale', 'pos_sale'] }, createdAt: { $gte: from } } },
        { $group: { _id: '$product', revenue: { $sum: '$totalValue' }, qty: { $sum: '$quantity' } } },
        { $sort: { revenue: -1 } }, { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
      ]),
      automationService.generateCashFlowForecast(companyId),
      BusinessInsight.find({ company: companyId, status: 'active' }).sort({ generatedAt: -1 }).limit(5),
      FraudAlert.countDocuments({ company: companyId, status: 'open' })
    ]);

    const rev = revenue[0] || {};
    const prevRev = prevRevenue[0]?.total || 0;
    const growth = prevRev > 0 ? ((rev.total - prevRev) / prevRev * 100).toFixed(1) : 0;

    // Revenue trend (last 7 days)
    const trendDays = 7;
    const trendData = await Invoice.aggregate([
      { $match: { company: companyId, status: 'active', createdAt: { $gte: new Date(Date.now() - trendDays * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        role: 'CEO',
        period,
        kpis: {
          totalRevenue: rev.total || 0,
          totalOrders: rev.count || 0,
          avgOrderValue: parseFloat((rev.avgOrder || 0).toFixed(2)),
          revenueGrowth: parseFloat(growth),
          cashFlowStatus: cashFlow.data?.netCashFlow >= 0 ? 'positive' : 'negative',
          netCashFlow: cashFlow.data?.netCashFlow || 0,
          openFraudAlerts: fraudCount
        },
        revenueTrend: trendData,
        topBranches: topBranches.map(b => ({
          branch: b.branch?.name || 'Main Branch',
          revenue: b.revenue,
          orders: b.orders
        })),
        topProducts: topProducts.map(p => ({
          product: p.product?.name,
          sku: p.product?.sku,
          revenue: p.revenue,
          qty: p.qty
        })),
        cashFlow: cashFlow.data,
        insights: aiInsights
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CFO Dashboard ────────────────────────────────────────────────────────────
// Metrics: P&L, Cash Flow, Receivables, Payables, Expense Analysis
router.get('/cfo', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { from } = getDateRange(period);
    const companyId = req.user.company;

    const [invoiceStats, purchaseStats, receivables, payables] = await Promise.all([
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$grandTotal' }, paid: { $sum: '$paidAmount' }, balance: { $sum: '$balanceDue' } } }
      ]),
      PurchaseOrder.aggregate([
        { $match: { company: companyId, createdAt: { $gte: from } } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$balanceDue' }, count: { $sum: 1 } } }
      ]),
      PurchaseOrder.aggregate([
        { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial'] }, status: { $in: ['received', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
      ])
    ]);

    const totalRevenue = invoiceStats.reduce((s, i) => s + i.total, 0);
    const totalPaid = invoiceStats.reduce((s, i) => s + i.paid, 0);
    const totalReceivables = receivables[0]?.total || 0;
    const totalPayables = payables[0]?.total || 0;
    const totalPurchased = purchaseStats.reduce((s, p) => s + p.total, 0);

    res.json({
      success: true,
      data: {
        role: 'CFO',
        period,
        pnl: {
          totalRevenue,
          totalPurchased,
          grossProfit: totalRevenue - totalPurchased,
          grossMargin: totalRevenue > 0 ? ((totalRevenue - totalPurchased) / totalRevenue * 100).toFixed(2) : 0,
          totalCollected: totalPaid
        },
        cashFlow: {
          totalReceivables,
          totalPayables,
          netPosition: totalReceivables - totalPayables,
          receivablesCount: receivables[0]?.count || 0,
          payablesCount: payables[0]?.count || 0
        },
        invoiceBreakdown: invoiceStats,
        purchaseBreakdown: purchaseStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Inventory Head Dashboard ─────────────────────────────────────────────────
router.get('/inventory-head', async (req, res) => {
  try {
    const companyId = req.user.company;

    const [totalSKUs, lowStock, outOfStock, deadStock, expiringBatches, topMoving] = await Promise.all([
      Inventory.countDocuments({ company: companyId }),
      Inventory.countDocuments({ company: companyId, $expr: { $lte: ['$quantity', '$reorderLevel'] }, reorderLevel: { $gt: 0 }, quantity: { $gt: 0 } }),
      Inventory.countDocuments({ company: companyId, quantity: { $lte: 0 } }),
      automationService.identifyDeadStock(companyId, 90),
      require('../models/Inventory').then ? null : null, // handled below
      StockMovement.aggregate([
        { $match: { company: companyId, movementType: { $in: ['sale', 'pos_sale'] }, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' }, value: { $sum: '$totalValue' } } },
        { $sort: { qty: -1 } }, { $limit: 10 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
      ])
    ]);

    const { Batch } = require('../models/Inventory');
    const expBatches = await Batch.find({
      company: companyId,
      expiryDate: { $lte: new Date(Date.now() + 30 * 86400000), $gt: new Date() },
      isExpired: false,
      quantity: { $gt: 0 }
    }).populate('product', 'name sku').limit(20);

    res.json({
      success: true,
      data: {
        role: 'Inventory Head',
        summary: { totalSKUs, lowStock, outOfStock, deadStockProducts: deadStock.data?.totalProducts || 0, deadStockValue: deadStock.data?.totalValue || 0 },
        expiringBatches: expBatches.map(b => ({ product: b.product?.name, batch: b.batchNumber, qty: b.quantity, expiry: b.expiryDate })),
        topMovingProducts: topMoving.map(m => ({ product: m.product?.name, sku: m.product?.sku, qty: m.qty, value: m.value })),
        deadStock: deadStock.data?.products?.slice(0, 10) || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Sales Head Dashboard ─────────────────────────────────────────────────────
router.get('/sales-head', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const { from } = getDateRange(period);
    const companyId = req.user.company;

    const [salesStats, topCustomers, paymentStatus, dailySales] = await Promise.all([
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 }, newCustomers: { $addToSet: '$customer' } } }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: '$customer', name: { $first: '$customerName' }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } }, { $limit: 10 }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, createdAt: { $gte: from } } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
      ]),
      Invoice.aggregate([
        { $match: { company: companyId, status: 'active', createdAt: { $gte: from } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    const stats = salesStats[0] || {};

    res.json({
      success: true,
      data: {
        role: 'Sales Head',
        period,
        summary: {
          totalRevenue: stats.revenue || 0,
          totalOrders: stats.orders || 0,
          uniqueCustomers: (stats.newCustomers || []).length,
          avgOrderValue: stats.orders > 0 ? (stats.revenue / stats.orders).toFixed(2) : 0
        },
        topCustomers,
        paymentStatus,
        dailySalesTrend: dailySales
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── AI Business Briefing ─────────────────────────────────────────────────────
router.get('/briefing', async (req, res) => {
  try {
    const companyId = req.user.company;

    const [salesForecast, cashFlow, deadStock, fraudAlerts, insights] = await Promise.all([
      automationService.generateSalesForecast(companyId, 30),
      automationService.generateCashFlowForecast(companyId),
      automationService.identifyDeadStock(companyId, 90),
      FraudAlert.find({ company: companyId, status: 'open', severity: { $in: ['high', 'critical'] } }).limit(3),
      BusinessInsight.find({ company: companyId, status: 'active', impact: { $in: ['high', 'critical'] } }).sort({ generatedAt: -1 }).limit(5)
    ]);

    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

    res.json({
      success: true,
      data: {
        greeting: `${greeting}, ${req.user.name}!`,
        date: now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        summary: {
          forecast: salesForecast.summary,
          cashFlow: cashFlow.summary,
          cashFlowRecommendation: cashFlow.recommendation,
          deadStock: `${deadStock.data?.totalProducts || 0} products are dead stock (₹${(deadStock.data?.totalValue || 0).toFixed(0)} tied up)`,
          urgentAlerts: fraudAlerts.length
        },
        priorityInsights: insights,
        fraudAlerts: fraudAlerts.map(a => ({ title: a.title, severity: a.severity, type: a.alertType })),
        generatedAt: now
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
