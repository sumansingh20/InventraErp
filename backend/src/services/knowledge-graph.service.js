'use strict';

const logger = require('../config/logger');

/**
 * INVENTRA KNOWLEDGE GRAPH ENGINE
 * Links all entities — Product ↔ Customer ↔ Orders ↔ Suppliers ↔ Warehouse ↔ Warranty ↔ Service
 * Provides Product 360 and Customer 360 views with full relationship data.
 */

// ─── Product 360° Intelligence ────────────────────────────────────────────────
exports.getProduct360 = async (productId, companyId) => {
  const Product = require('../models/Product');
  const { Inventory, StockMovement, Batch, Serial } = require('../models/Inventory');
  const Invoice = require('../models/Invoice');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Return = require('../models/Return');
  const Warranty = require('../models/Warranty');
  const ServiceRecord = require('../models/ServiceRecord');

  const mongoose = require('mongoose');
  const oid = mongoose.Types.ObjectId.isValid(productId)
    ? new mongoose.Types.ObjectId(productId) : null;
  if (!oid) throw new Error('Invalid product ID');

  const [product, inventory, movements, batches, serials, invoiceStats, purchaseStats, returnStats, warranties, serviceRecords] = await Promise.all([
    Product.findOne({ _id: oid, company: companyId })
      .populate('category', 'name')
      .populate('preferredSupplier', 'name phone rating')
      .lean(),

    Inventory.find({ company: companyId, product: oid })
      .populate('warehouse', 'name city')
      .populate('zone', 'name code')
      .lean(),

    StockMovement.aggregate([
      { $match: { company: companyId, product: oid } },
      { $group: { _id: '$movementType', totalQty: { $sum: '$quantity' }, totalValue: { $sum: '$totalValue' }, count: { $sum: 1 } } }
    ]),

    Batch.find({ company: companyId, product: oid, quantity: { $gt: 0 } }).limit(10).lean(),
    Serial.find({ company: companyId, product: oid }).limit(20).lean(),

    Invoice.aggregate([
      { $unwind: '$items' },
      { $match: { company: companyId, 'items.product': oid } },
      { $group: {
        _id: null,
        totalQtySold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.total' },
        invoiceCount: { $sum: 1 },
        avgSellingPrice: { $avg: '$items.sellingPrice' },
        topCustomers: { $addToSet: '$customer' }
      }}
    ]),

    PurchaseOrder.aggregate([
      { $unwind: '$items' },
      { $match: { company: companyId, 'items.product': oid } },
      { $group: {
        _id: null,
        totalQtyPurchased: { $sum: '$items.orderedQty' },
        totalSpent: { $sum: '$items.total' },
        poCount: { $sum: 1 },
        avgPurchasePrice: { $avg: '$items.purchasePrice' },
        suppliers: { $addToSet: '$supplier' }
      }}
    ]),

    Return.aggregate([
      { $unwind: '$items' },
      { $match: { company: companyId, 'items.product': oid } },
      { $group: { _id: '$returnType', totalQty: { $sum: '$items.quantity' }, count: { $sum: 1 } } }
    ]),

    Warranty.find({ company: companyId, product: oid }).limit(10).lean(),
    ServiceRecord.find({ company: companyId, product: oid }).limit(10).lean()
  ]);

  if (!product) return { found: false, productId };

  // Build movement map
  const movementMap = {};
  movements.forEach(m => { movementMap[m._id] = m; });

  const sold = movementMap['sale'] || movementMap['pos_sale'] || { totalQty: 0, totalValue: 0, count: 0 };
  const purchased = movementMap['purchase'] || { totalQty: 0, totalValue: 0, count: 0 };
  const adjusted = (movementMap['adjustment_in']?.totalQty || 0) - (movementMap['adjustment_out']?.totalQty || 0);

  const salesStats = invoiceStats[0] || {};
  const purchStats = purchaseStats[0] || {};
  const totalStock = inventory.reduce((s, i) => s + i.quantity, 0);

  const margin = (product.sellingPrice && product.purchasePrice)
    ? ((product.sellingPrice - product.purchasePrice) / product.sellingPrice * 100).toFixed(2)
    : 0;

  return {
    found: true,
    product: {
      id: product._id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category?.name,
      brand: product.brand,
      hsn: product.hsn,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      taxRate: product.taxRate,
      isSerialTracked: product.trackSerial,
      isBatchTracked: product.trackBatch,
      primaryImage: product.primaryImage
    },
    profitability: {
      marginPercent: parseFloat(margin),
      totalRevenue: salesStats.totalRevenue || 0,
      totalCOGS: purchStats.totalSpent || 0,
      grossProfit: (salesStats.totalRevenue || 0) - (purchStats.totalSpent || 0),
      avgSellingPrice: salesStats.avgSellingPrice || product.sellingPrice,
      avgPurchasePrice: purchStats.avgPurchasePrice || product.purchasePrice
    },
    inventory: {
      totalStock,
      locations: inventory.map(i => ({
        warehouse: i.warehouse?.name,
        city: i.warehouse?.city,
        zone: i.zone?.name,
        quantity: i.quantity,
        reserved: i.reservedQuantity || 0,
        reorderLevel: i.reorderLevel
      })),
      batches: batches.length,
      serials: serials.length,
      batchDetails: batches.slice(0, 5)
    },
    salesGraph: {
      totalQtySold: salesStats.totalQtySold || sold.totalQty || 0,
      totalRevenue: salesStats.totalRevenue || sold.totalValue || 0,
      invoiceCount: salesStats.invoiceCount || sold.count || 0,
      uniqueCustomers: (salesStats.topCustomers || []).length,
    },
    purchaseGraph: {
      totalQtyPurchased: purchStats.totalQtyPurchased || purchased.totalQty || 0,
      totalSpent: purchStats.totalSpent || purchased.totalValue || 0,
      poCount: purchStats.poCount || purchased.count || 0,
      uniqueSuppliers: (purchStats.suppliers || []).length,
      preferredSupplier: product.preferredSupplier ? {
        name: product.preferredSupplier.name,
        phone: product.preferredSupplier.phone
      } : null
    },
    returns: returnStats.map(r => ({ type: r._id, qty: r.totalQty, count: r.count })),
    afterSales: {
      warranties: warranties.length,
      activeWarranties: warranties.filter(w => !w.isExpired).length,
      serviceTickets: serviceRecords.length,
      openServiceTickets: serviceRecords.filter(s => s.status !== 'completed').length
    },
    movements: {
      totalSold: sold.totalQty,
      totalPurchased: purchased.totalQty,
      netAdjusted: adjusted,
      movementTypes: movementMap
    },
    generatedAt: new Date()
  };
};

// ─── Customer 360° Intelligence ───────────────────────────────────────────────
exports.getCustomer360 = async (customerId, companyId) => {
  const Customer = require('../models/Customer');
  const Invoice = require('../models/Invoice');
  const Return = require('../models/Return');
  const { Lead, Opportunity } = require('../models/CRM');

  const mongoose = require('mongoose');
  const oid = new mongoose.Types.ObjectId(customerId);

  const [customer, invoiceStats, topProducts, paymentStats, returns, leads, opportunities] = await Promise.all([
    Customer.findOne({ _id: oid, company: companyId }).lean(),

    Invoice.aggregate([
      { $match: { company: companyId, customer: oid } },
      { $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalRevenue: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        totalOutstanding: { $sum: '$balanceDue' },
        avgOrderValue: { $avg: '$grandTotal' },
        lastOrderDate: { $max: '$createdAt' }
      }}
    ]),

    Invoice.aggregate([
      { $match: { company: companyId, customer: oid } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.productName' }, totalQty: { $sum: '$items.quantity' }, totalValue: { $sum: '$items.total' } } },
      { $sort: { totalValue: -1 } },
      { $limit: 10 }
    ]),

    Invoice.aggregate([
      { $match: { company: companyId, customer: oid, paymentStatus: 'paid' } },
      { $group: { _id: null, avgDaysToPay: { $avg: { $subtract: ['$paidAt', '$createdAt'] } } } }
    ]),

    Return.find({ company: companyId, customer: oid }).select('returnType totalAmount status createdAt').limit(10).lean(),

    Lead.find({ company: companyId, contact: { $elemMatch: { email: customer?.email } } }).limit(5).lean().catch(() => []),
    Opportunity.find({ company: companyId, customer: oid }).select('title stage amount probability').limit(10).lean().catch(() => [])
  ]);

  if (!customer) return { found: false, customerId };

  const stats = invoiceStats[0] || {};
  const avgDaysToPay = paymentStats[0]?.avgDaysToPay
    ? Math.round(paymentStats[0].avgDaysToPay / 86400000) : null;

  // Customer Health Score (0-100)
  let healthScore = 50;
  if (stats.totalRevenue > 100000) healthScore += 20;
  if (stats.totalOutstanding === 0) healthScore += 15;
  if (avgDaysToPay && avgDaysToPay < 15) healthScore += 15;
  if (returns.length > 5) healthScore -= 20;
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    found: true,
    customer: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      gstin: customer.gstin,
      loyaltyTier: customer.loyaltyTier,
      loyaltyPoints: customer.loyaltyPoints,
      creditLimit: customer.creditLimit,
      priceGroup: customer.priceGroup,
      tags: customer.tags || []
    },
    financials: {
      totalRevenue: stats.totalRevenue || 0,
      totalPaid: stats.totalPaid || 0,
      totalOutstanding: stats.totalOutstanding || 0,
      totalInvoices: stats.totalInvoices || 0,
      avgOrderValue: parseFloat((stats.avgOrderValue || 0).toFixed(2)),
      lastOrderDate: stats.lastOrderDate,
      avgDaysToPay
    },
    topProducts: topProducts.map(p => ({ product: p._id, name: p.name, qty: p.totalQty, value: p.totalValue })),
    returns: {
      count: returns.length,
      totalValue: returns.reduce((s, r) => s + (r.totalAmount || 0), 0),
      details: returns
    },
    crm: {
      leads: leads.length,
      opportunities: opportunities.length,
      pipelineValue: opportunities.reduce((s, o) => s + (o.amount || 0), 0)
    },
    healthScore,
    healthLabel: healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Average' : 'At Risk',
    generatedAt: new Date()
  };
};

// ─── Supplier Reliability Score ───────────────────────────────────────────────
exports.getSupplierScore = async (supplierId, companyId) => {
  const Supplier = require('../models/Supplier');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Return = require('../models/Return');

  const mongoose = require('mongoose');
  const oid = new mongoose.Types.ObjectId(supplierId);

  const [supplier, poStats, returns] = await Promise.all([
    Supplier.findOne({ _id: oid, company: companyId }).lean(),
    PurchaseOrder.aggregate([
      { $match: { company: companyId, supplier: oid } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' },
        onTimeDeliveries: {
          $sum: { $cond: [{ $lte: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, 1, 0] }
        },
        avgDelayDays: {
          $avg: { $divide: [{ $subtract: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, 86400000] }
        }
      }}
    ]),
    Return.aggregate([
      { $match: { company: companyId, supplier: oid, returnType: 'purchase' } },
      { $group: { _id: null, returnCount: { $sum: 1 }, returnValue: { $sum: '$totalAmount' } } }
    ])
  ]);

  if (!supplier) return { found: false };

  const stats = poStats[0] || {};
  const returnStats = returns[0] || { returnCount: 0, returnValue: 0 };

  // Score components
  const onTimeRate = stats.totalOrders > 0
    ? (stats.onTimeDeliveries / stats.totalOrders) * 100 : 50;
  const returnRate = stats.totalOrders > 0
    ? (returnStats.returnCount / stats.totalOrders) * 100 : 0;
  const avgDelay = Math.max(0, stats.avgDelayDays || 0);

  const score = Math.max(0, Math.min(100, Math.round(
    onTimeRate * 0.5 +             // 50% weight on delivery timeliness
    (100 - returnRate) * 0.3 +     // 30% weight on return rate
    Math.max(0, 100 - avgDelay * 10) * 0.2  // 20% weight on avg delay
  )));

  return {
    found: true,
    supplier: { id: supplier._id, name: supplier.name, phone: supplier.phone },
    score,
    label: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Average' : 'Poor',
    metrics: {
      totalOrders: stats.totalOrders || 0,
      totalValue: stats.totalValue || 0,
      onTimeRate: parseFloat(onTimeRate.toFixed(1)),
      avgDelayDays: parseFloat(avgDelay.toFixed(1)),
      returnCount: returnStats.returnCount,
      returnRate: parseFloat(returnRate.toFixed(1))
    }
  };
};
