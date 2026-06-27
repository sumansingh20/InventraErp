'use strict';

const logger = require('../config/logger');

/**
 * FRAUD DETECTION ENGINE
 * Automatically detects suspicious patterns and generates FraudAlerts.
 */

exports.runFraudScan = async (companyId = null) => {
  const checks = [
    exports.detectDuplicateInvoices,
    exports.detectAbnormalDiscounts,
    exports.detectDuplicateIMEISales,
    exports.detectNegativeStockAdjustments,
    exports.detectAfterHoursTransactions
  ];

  const results = [];
  for (const check of checks) {
    try {
      const found = companyId
        ? await check(companyId)
        : await check();
      results.push(...(found || []));
    } catch (err) {
      logger.error(`Fraud check failed: ${check.name}`, err.message);
    }
  }

  logger.info(`Fraud scan: ${results.length} alerts generated`);
  return results;
};

exports.detectDuplicateInvoices = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const FraudAlert = require('../models/FraudAlert');

  const query = { status: 'active' };
  if (companyId) query.company = companyId;

  const from = new Date();
  from.setHours(0, 0, 0, 0);

  // Find invoices with same customer, same amount, same day
  const duplicates = await Invoice.aggregate([
    { $match: { ...query, createdAt: { $gte: from } } },
    {
      $group: {
        _id: { company: '$company', customer: '$customer', grandTotal: '$grandTotal', date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        numbers: { $push: '$invoiceNumber' }
      }
    },
    { $match: { count: { $gte: 2 } } }
  ]);

  const alerts = [];
  for (const dup of duplicates) {
    const existing = await FraudAlert.findOne({
      company: dup._id.company,
      alertType: 'duplicate_invoice',
      'evidence.invoiceNumbers': { $in: dup.numbers }
    });
    if (existing) continue;

    const alert = await FraudAlert.create({
      company: dup._id.company,
      alertType: 'duplicate_invoice',
      severity: 'high',
      title: `Possible Duplicate Invoice Detected`,
      description: `${dup.count} invoices found for the same customer with amount ₹${dup._id.grandTotal} on the same day.`,
      entityType: 'Invoice',
      entityId: dup.ids[0],
      evidence: {
        invoiceIds: dup.ids,
        invoiceNumbers: dup.numbers,
        amount: dup._id.grandTotal,
        date: dup._id.date
      }
    });
    alerts.push(alert);
  }

  return alerts;
};

exports.detectAbnormalDiscounts = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const FraudAlert = require('../models/FraudAlert');

  const query = { discountAmount: { $gt: 0 } };
  if (companyId) query.company = companyId;

  const from = new Date();
  from.setDate(from.getDate() - 1);
  query.createdAt = { $gte: from };

  // Find invoices where discount is more than 50% of subtotal
  const suspicious = await Invoice.find({
    ...query,
    $expr: { $gt: ['$discountAmount', { $multiply: ['$subtotal', 0.5] }] }
  }).populate('createdBy', 'name').limit(20).lean();

  const alerts = [];
  for (const inv of suspicious) {
    const discountPct = ((inv.discountAmount / inv.subtotal) * 100).toFixed(1);
    const existing = await FraudAlert.findOne({
      company: inv.company,
      alertType: 'large_discount_without_approval',
      entityId: inv._id
    });
    if (existing) continue;

    const alert = await FraudAlert.create({
      company: inv.company,
      alertType: 'large_discount_without_approval',
      severity: discountPct > 70 ? 'critical' : 'high',
      title: `Abnormal Discount: ${discountPct}% on Invoice ${inv.invoiceNumber}`,
      description: `Invoice ${inv.invoiceNumber} has a discount of ₹${inv.discountAmount} (${discountPct}%) which is unusually high.`,
      entityType: 'Invoice',
      entityId: inv._id,
      entityNumber: inv.invoiceNumber,
      suspectedUser: inv.createdBy?._id,
      suspectedUserName: inv.createdBy?.name,
      evidence: { discountAmount: inv.discountAmount, subtotal: inv.subtotal, discountPercent: discountPct }
    });
    alerts.push(alert);
  }

  return alerts;
};

exports.detectDuplicateIMEISales = async (companyId) => {
  const { Serial } = require('../models/Inventory');
  const FraudAlert = require('../models/FraudAlert');

  const query = { status: 'sold', imei1: { $exists: true, $ne: null } };
  if (companyId) query.company = companyId;

  const duplicateIMEIs = await Serial.aggregate([
    { $match: query },
    { $group: { _id: { company: '$company', imei1: '$imei1' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gte: 2 } } }
  ]);

  const alerts = [];
  for (const dup of duplicateIMEIs) {
    const existing = await FraudAlert.findOne({
      company: dup._id.company,
      alertType: 'imei_duplicate_sale'
    });
    if (existing) continue;

    const alert = await FraudAlert.create({
      company: dup._id.company,
      alertType: 'imei_duplicate_sale',
      severity: 'critical',
      title: `Duplicate IMEI Sale Detected`,
      description: `IMEI ${dup._id.imei1} has been sold ${dup.count} times. Possible fraud or system error.`,
      entityType: 'Serial',
      entityId: dup.ids[0],
      evidence: { imei: dup._id.imei1, serialIds: dup.ids, saleCount: dup.count }
    });
    alerts.push(alert);
  }

  return alerts;
};

exports.detectNegativeStockAdjustments = async (companyId) => {
  const { StockMovement } = require('../models/Inventory');
  const FraudAlert = require('../models/FraudAlert');

  const from = new Date();
  from.setDate(from.getDate() - 1);
  const query = {
    movementType: 'adjustment_out',
    quantity: { $gt: 50 },
    createdAt: { $gte: from }
  };
  if (companyId) query.company = companyId;

  const suspicious = await StockMovement.find(query)
    .populate('performedBy', 'name')
    .populate('product', 'name').limit(10).lean();

  const alerts = [];
  for (const mv of suspicious) {
    const existing = await FraudAlert.findOne({ company: mv.company, entityId: mv._id });
    if (existing) continue;

    const alert = await FraudAlert.create({
      company: mv.company,
      alertType: 'stock_manipulation',
      severity: mv.quantity > 200 ? 'critical' : 'medium',
      title: `Large Stock Adjustment: -${mv.quantity} units of ${mv.product?.name}`,
      description: `A large negative stock adjustment of ${mv.quantity} units was made for ${mv.product?.name}.`,
      entityType: 'StockMovement',
      entityId: mv._id,
      suspectedUser: mv.performedBy?._id,
      suspectedUserName: mv.performedBy?.name,
      evidence: { quantity: mv.quantity, product: mv.product?.name, reason: mv.notes }
    });
    alerts.push(alert);
  }

  return alerts;
};

exports.detectAfterHoursTransactions = async (companyId) => {
  const Invoice = require('../models/Invoice');
  const FraudAlert = require('../models/FraudAlert');

  // Transactions created between midnight and 5 AM
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const afterHoursInvoices = await Invoice.find({
    ...(companyId ? { company: companyId } : {}),
    createdAt: { $gte: from },
    $expr: {
      $and: [
        { $gte: [{ $hour: '$createdAt' }, 0] },
        { $lte: [{ $hour: '$createdAt' }, 5] }
      ]
    }
  }).populate('createdBy', 'name').limit(5).lean();

  const alerts = [];
  for (const inv of afterHoursInvoices) {
    const existing = await FraudAlert.findOne({ company: inv.company, entityId: inv._id });
    if (existing) continue;

    const alert = await FraudAlert.create({
      company: inv.company,
      alertType: 'after_hours_transaction',
      severity: 'medium',
      title: `After-Hours Transaction: Invoice ${inv.invoiceNumber}`,
      description: `Invoice ${inv.invoiceNumber} worth ₹${inv.grandTotal} was created between midnight and 5 AM.`,
      entityType: 'Invoice',
      entityId: inv._id,
      entityNumber: inv.invoiceNumber,
      suspectedUser: inv.createdBy?._id,
      suspectedUserName: inv.createdBy?.name,
      evidence: { time: inv.createdAt, amount: inv.grandTotal }
    });
    alerts.push(alert);
  }

  return alerts;
};
