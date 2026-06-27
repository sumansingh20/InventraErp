'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Invoice = require('../models/Invoice');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { Inventory, StockMovement } = require('../models/Inventory');
const Customer = require('../models/Customer');
const { Employee } = require('../models/Employee');
const Product = require('../models/Product');
const { Lead } = require('../models/CRM');
const mongoose = require('mongoose');

const router = express.Router();
router.use(authenticate);

const oid = (id) => mongoose.Types.ObjectId(id);

// ─── Executive Dashboard ────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const companyId = oid(req.companyId);
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 3, 1); // April 1 (Indian FY)
  
  const [
    todaySales, monthSales, yearSales,
    todayPurchases, monthPurchases,
    totalCustomers, activeCustomers,
    totalProducts, lowStockCount,
    pendingOrders, pendingPayables,
    todayInvoices, openLeads
  ] = await Promise.all([
    // Today's sales
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startOfDay, $lte: endOfDay } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]),
    
    // Month sales
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]),
    
    // Year sales
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startOfYear } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]),
    
    // Today purchases
    PurchaseOrder.aggregate([
      { $match: { company: companyId, orderDate: { $gte: startOfDay, $lte: endOfDay } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]),
    
    // Month purchases
    PurchaseOrder.aggregate([
      { $match: { company: companyId, orderDate: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]),
    
    Customer.countDocuments({ company: req.companyId }),
    Customer.countDocuments({ company: req.companyId, isActive: true }),
    Product.countDocuments({ company: req.companyId, isActive: true, isDeleted: false }),
    
    // Low stock
    Product.countDocuments({
      company: req.companyId, isActive: true, isDeleted: false, trackInventory: true,
      $expr: { $lte: ['$currentStock', '$reorderLevel'] }
    }),
    
    // Pending sales orders
    Invoice.countDocuments({ company: req.companyId, paymentStatus: 'unpaid', status: 'active' }),
    
    // Payables
    PurchaseOrder.aggregate([
      { $match: { company: companyId, paymentStatus: { $in: ['unpaid', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$dueAmount' } } }
    ]),
    
    // Today invoices list
    Invoice.find({ company: req.companyId, invoiceDate: { $gte: startOfDay, $lte: endOfDay }, status: 'active' })
      .populate('customer', 'name').select('invoiceNumber customerName grandTotal paymentStatus').limit(10),
    
    Lead.countDocuments({ company: req.companyId, status: { $in: ['new', 'contacted'] } })
  ]);
  
  // Sales trend (last 7 days)
  const salesTrend = await Invoice.aggregate([
    {
      $match: {
        company: companyId,
        invoiceType: { $in: ['sale', 'pos'] },
        status: 'active',
        invoiceDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } },
        total: { $sum: '$grandTotal' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Top products (by revenue this month)
  const topProducts = await StockMovement.aggregate([
    {
      $match: {
        company: companyId,
        movementType: { $in: ['sale', 'pos_sale'] },
        createdAt: { $gte: startOfMonth }
      }
    },
    { $group: { _id: '$product', revenue: { $sum: '$totalValue' }, qty: { $sum: '$quantity' } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { name: '$product.name', sku: '$product.sku', revenue: 1, qty: 1 } }
  ]);
  
  // Receivables aging
  const receivables = await Invoice.aggregate([
    {
      $match: {
        company: companyId,
        paymentStatus: { $in: ['unpaid', 'partial'] },
        status: 'active',
        invoiceType: { $in: ['sale', 'pos'] }
      }
    },
    {
      $addFields: {
        daysPending: { $divide: [{ $subtract: [new Date(), '$invoiceDate'] }, 1000 * 60 * 60 * 24] }
      }
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $lte: ['$daysPending', 30] }, then: '0-30' },
              { case: { $lte: ['$daysPending', 60] }, then: '31-60' },
              { case: { $lte: ['$daysPending', 90] }, then: '61-90' }
            ],
            default: '90+'
          }
        },
        amount: { $sum: '$dueAmount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: {
      kpis: {
        todaySales: todaySales[0]?.total || 0,
        todaySalesCount: todaySales[0]?.count || 0,
        monthSales: monthSales[0]?.total || 0,
        monthSalesCount: monthSales[0]?.count || 0,
        yearSales: yearSales[0]?.total || 0,
        todayPurchases: todayPurchases[0]?.total || 0,
        monthPurchases: monthPurchases[0]?.total || 0,
        totalCustomers,
        activeCustomers,
        totalProducts,
        lowStockCount,
        pendingOrders,
        totalPayables: pendingPayables[0]?.total || 0,
        openLeads
      },
      salesTrend,
      topProducts,
      receivablesAging: receivables,
      recentInvoices: todayInvoices
    }
  });
}));

// ─── Sales Analytics ───────────────────────────────────────────────────────────
router.get('/sales-analytics', asyncHandler(async (req, res) => {
  const companyId = oid(req.companyId);
  const { period = 'month' } = req.query;
  
  let groupBy, startDate;
  const now = new Date();
  
  if (period === 'week') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } };
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } };
  } else {
    startDate = new Date(now.getFullYear(), 3, 1);
    groupBy = { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } };
  }
  
  const [salesByDate, salesByPaymentMode, topCustomers] = await Promise.all([
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startDate } } },
      { $group: { _id: groupBy, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startDate } } },
      { $lookup: { from: 'payments', localField: '_id', foreignField: 'allocations.invoiceId', as: 'payments' } },
      { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$payments.paymentMode', amount: { $sum: '$payments.amount' } } }
    ]),
    
    Invoice.aggregate([
      { $match: { company: companyId, invoiceType: { $in: ['sale', 'pos'] }, status: 'active', invoiceDate: { $gte: startDate } } },
      { $group: { _id: '$customer', totalRevenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
      { $sort: { totalRevenue: -1 } }, { $limit: 10 },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $project: { name: { $ifNull: ['$customer.name', 'Walk-in'] }, totalRevenue: 1, orders: 1 } }
    ])
  ]);
  
  res.json({ success: true, data: { salesByDate, salesByPaymentMode, topCustomers } });
}));

// ─── Inventory Analytics ────────────────────────────────────────────────────────
router.get('/inventory-analytics', asyncHandler(async (req, res) => {
  const companyId = oid(req.companyId);
  
  const [valueByCategory, movementSummary, stockValue] = await Promise.all([
    Product.aggregate([
      { $match: { company: companyId, isActive: true, isDeleted: false } },
      { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$cat.name', 'Uncategorized'] }, count: { $sum: 1 }, totalValue: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } },
      { $sort: { totalValue: -1 } }
    ]),
    
    StockMovement.aggregate([
      { $match: { company: companyId, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: '$movementType', qty: { $sum: '$quantity' }, value: { $sum: '$totalValue' } } }
    ]),
    
    Inventory.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: null, totalQty: { $sum: '$quantity' }, totalValue: { $sum: '$totalValue' } } }
    ])
  ]);
  
  res.json({ success: true, data: { valueByCategory, movementSummary, stockValue: stockValue[0] } });
}));

module.exports = router;
