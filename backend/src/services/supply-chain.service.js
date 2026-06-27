'use strict';

const logger = require('../config/logger');

/**
 * INVENTRA SUPPLY CHAIN TOWER
 * Track the complete lifecycle of a product:
 * Supplier → Purchase → Transit → Warehouse → Shelf → Sale → Customer → Warranty → Service → Return → Disposal
 */

exports.trackProductLifecycle = async (productId, companyId) => {
  const Product = require('../models/Product');
  const { Inventory, StockMovement, Batch, Serial } = require('../models/Inventory');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Invoice = require('../models/Invoice');
  const Delivery = require('../models/Delivery');
  const Return = require('../models/Return');
  const Warranty = require('../models/Warranty');
  const ServiceRecord = require('../models/ServiceRecord');

  const mongoose = require('mongoose');
  const oid = new mongoose.Types.ObjectId(productId);

  const [product, purchaseOrders, invoices, deliveries, returns, warranties, serviceRecords, inventory, movements] = await Promise.all([
    Product.findOne({ _id: oid, company: companyId })
      .populate('preferredSupplier', 'name phone city')
      .lean(),

    PurchaseOrder.find({ company: companyId, 'items.product': oid })
      .select('poNumber supplier supplierName status orderDate actualDeliveryDate grandTotal')
      .populate('supplier', 'name city')
      .sort({ orderDate: -1 })
      .limit(10)
      .lean(),

    Invoice.find({ company: companyId, 'items.product': oid })
      .select('invoiceNumber customer customerName status createdAt grandTotal paymentStatus')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Delivery.find({ company: companyId, 'items.product': oid })
      .select('deliveryNumber status scheduledAt deliveredAt deliveryAgent trackingEvents')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Return.find({ company: companyId, 'items.product': oid })
      .select('returnNumber returnType status totalAmount createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Warranty.find({ company: companyId, product: oid })
      .select('serial warrantyPeriod expiryDate status isExpired')
      .limit(20)
      .lean(),

    ServiceRecord.find({ company: companyId, product: oid })
      .select('ticketNumber status issue resolution createdAt completedDate')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Inventory.find({ company: companyId, product: oid })
      .populate('warehouse', 'name city')
      .lean(),

    StockMovement.find({ company: companyId, product: oid })
      .select('movementType quantity totalValue reference createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
  ]);

  if (!product) return { found: false, productId };

  // ─── Build Timeline (chronological events) ─────────────────────────────────
  const timeline = [];

  // PO events
  for (const po of purchaseOrders) {
    timeline.push({
      stage: 'purchase',
      event: 'Purchase Order Created',
      icon: 'cart-plus',
      color: 'blue',
      date: po.orderDate,
      reference: po.poNumber,
      entity: `${po.supplierName || po.supplier?.name} — ₹${po.grandTotal?.toFixed(2)}`,
      status: po.status,
      id: po._id
    });
    if (po.actualDeliveryDate) {
      timeline.push({
        stage: 'transit',
        event: 'Goods Received',
        icon: 'box-seam-fill',
        color: 'cyan',
        date: po.actualDeliveryDate,
        reference: po.poNumber,
        entity: po.supplierName || po.supplier?.name,
        status: 'completed'
      });
    }
  }

  // Warehouse events (from stock movements)
  for (const mv of movements) {
    if (mv.movementType === 'purchase' || mv.movementType === 'transfer_in') {
      timeline.push({
        stage: 'warehouse',
        event: mv.movementType === 'purchase' ? 'Stocked in Warehouse' : 'Stock Transferred In',
        icon: 'building',
        color: 'purple',
        date: mv.createdAt,
        reference: mv.reference,
        entity: `${mv.quantity} units`,
        status: 'completed'
      });
    }
    if (mv.movementType === 'sale' || mv.movementType === 'pos_sale') {
      timeline.push({
        stage: 'sale',
        event: 'Sold',
        icon: 'receipt',
        color: 'green',
        date: mv.createdAt,
        reference: mv.reference,
        entity: `${mv.quantity} units — ₹${mv.totalValue?.toFixed(2)}`,
        status: 'completed'
      });
    }
  }

  // Delivery events
  for (const del of deliveries) {
    timeline.push({
      stage: 'delivery',
      event: del.status === 'delivered' ? 'Delivered to Customer' : `Delivery ${del.status}`,
      icon: 'truck',
      color: del.status === 'delivered' ? 'green' : 'yellow',
      date: del.deliveredAt || del.scheduledAt,
      reference: del.deliveryNumber,
      entity: del.status,
      status: del.status,
      id: del._id
    });
  }

  // Warranty events
  for (const w of warranties) {
    timeline.push({
      stage: 'warranty',
      event: w.isExpired ? 'Warranty Expired' : 'Under Warranty',
      icon: 'shield-check',
      color: w.isExpired ? 'red' : 'green',
      date: w.expiryDate,
      entity: `Expires: ${w.expiryDate?.toLocaleDateString?.() || '—'}`,
      status: w.isExpired ? 'expired' : 'active'
    });
  }

  // Service events
  for (const svc of serviceRecords) {
    timeline.push({
      stage: 'service',
      event: `Service Ticket: ${svc.issue || 'Repair'}`,
      icon: 'tools',
      color: 'orange',
      date: svc.createdAt,
      reference: svc.ticketNumber,
      entity: svc.status,
      status: svc.status,
      id: svc._id
    });
  }

  // Return events
  for (const ret of returns) {
    timeline.push({
      stage: 'return',
      event: `Return: ${ret.returnType}`,
      icon: 'arrow-return-left',
      color: 'red',
      date: ret.createdAt,
      reference: ret.returnNumber,
      entity: `₹${ret.totalAmount?.toFixed(2)} — ${ret.status}`,
      status: ret.status,
      id: ret._id
    });
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  // ─── Current Stage Detection ────────────────────────────────────────────────
  const totalStock = inventory.reduce((s, i) => s + i.quantity, 0);
  let currentStage = 'sourcing';
  if (purchaseOrders.length > 0) currentStage = 'purchased';
  if (totalStock > 0) currentStage = 'in_warehouse';
  if (invoices.length > 0 && totalStock < (purchaseOrders.length > 0 ? 10 : 0)) currentStage = 'sold';
  if (deliveries.some(d => d.status === 'delivered')) currentStage = 'delivered';
  if (serviceRecords.some(s => s.status !== 'completed')) currentStage = 'in_service';
  if (returns.length > invoices.length * 0.5) currentStage = 'high_returns';

  // ─── Supply Chain Health ────────────────────────────────────────────────────
  const avgLeadTime = purchaseOrders
    .filter(po => po.orderDate && po.actualDeliveryDate)
    .map(po => Math.round((new Date(po.actualDeliveryDate) - new Date(po.orderDate)) / 86400000))
    .reduce((s, d, _, a) => s + d / a.length, 0);

  const returnRate = invoices.length > 0
    ? (returns.length / invoices.length * 100).toFixed(1) : 0;

  return {
    found: true,
    product: {
      id: product._id,
      name: product.name,
      sku: product.sku,
      currentStage,
      totalStock
    },
    lifecycle: {
      stages: [
        { id: 'supplier', label: 'Supplier', completed: purchaseOrders.length > 0 },
        { id: 'purchase', label: 'Purchase Order', completed: purchaseOrders.length > 0 },
        { id: 'transit', label: 'Transit / GRN', completed: purchaseOrders.some(p => p.actualDeliveryDate) },
        { id: 'warehouse', label: 'Warehouse', completed: totalStock > 0 || movements.some(m => m.movementType === 'purchase') },
        { id: 'shelf', label: 'Shelf / Bin', completed: inventory.some(i => i.bin) },
        { id: 'sale', label: 'Sale', completed: invoices.length > 0 },
        { id: 'customer', label: 'Customer', completed: invoices.length > 0 },
        { id: 'warranty', label: 'Warranty', completed: warranties.length > 0 },
        { id: 'service', label: 'Service', completed: serviceRecords.length > 0 },
        { id: 'return', label: 'Return', completed: returns.length > 0 }
      ],
      currentStage
    },
    timeline,
    stats: {
      totalPurchaseOrders: purchaseOrders.length,
      totalInvoices: invoices.length,
      totalDeliveries: deliveries.length,
      totalReturns: returns.length,
      totalWarranties: warranties.length,
      openServiceTickets: serviceRecords.filter(s => s.status !== 'completed').length,
      avgLeadTimeDays: parseFloat(avgLeadTime.toFixed(1)),
      returnRate: parseFloat(returnRate)
    },
    supplier: product.preferredSupplier ? {
      name: product.preferredSupplier.name,
      phone: product.preferredSupplier.phone,
      city: product.preferredSupplier.city
    } : null,
    generatedAt: new Date()
  };
};

// ─── Supply Chain Health Summary ──────────────────────────────────────────────
exports.getSupplyChainHealth = async (companyId) => {
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Invoice = require('../models/Invoice');
  const Delivery = require('../models/Delivery');
  const { Inventory } = require('../models/Inventory');

  const [poStats, deliveryStats, overdueInvoices, lowStockCount] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: { company: companyId } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' }
      }}
    ]),
    Delivery.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Invoice.countDocuments({
      company: companyId,
      dueDate: { $lt: new Date() },
      paymentStatus: { $in: ['unpaid', 'partial'] }
    }),
    Inventory.countDocuments({
      company: companyId,
      $expr: { $lte: ['$quantity', '$reorderLevel'] },
      reorderLevel: { $gt: 0 }
    })
  ]);

  const poMap = {};
  poStats.forEach(p => { poMap[p._id] = p; });
  const deliveryMap = {};
  deliveryStats.forEach(d => { deliveryMap[d._id] = d; });

  const pendingPOs = (poMap['pending']?.count || 0) + (poMap['confirmed']?.count || 0);
  const inTransitDeliveries = deliveryMap['in_transit']?.count || 0;
  const deliveredToday = deliveryMap['delivered']?.count || 0;

  const healthScore = Math.max(0, Math.min(100, Math.round(
    100
    - Math.min(30, lowStockCount * 2)
    - Math.min(30, overdueInvoices * 3)
    - Math.min(20, pendingPOs * 1)
  )));

  return {
    healthScore,
    healthLabel: healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Critical',
    bottlenecks: [
      ...(lowStockCount > 0 ? [`${lowStockCount} products below reorder level`] : []),
      ...(overdueInvoices > 0 ? [`${overdueInvoices} overdue invoices`] : []),
      ...(pendingPOs > 0 ? [`${pendingPOs} unconfirmed purchase orders`] : [])
    ],
    metrics: {
      pendingPurchaseOrders: pendingPOs,
      inTransitDeliveries,
      deliveredToday,
      overdueInvoices,
      lowStockProducts: lowStockCount
    },
    purchaseOrdersByStatus: poMap,
    deliveriesByStatus: deliveryMap
  };
};
