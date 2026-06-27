'use strict';

const { PurchaseOrder, GRN } = require('../models/PurchaseOrder');
const { Inventory, StockMovement } = require('../models/Inventory');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const counterService = require('../services/counter.service');
const ocrService = require('../services/ocr.service');
const mongoose = require('mongoose');

// ─── Purchase Orders ──────────────────────────────────────────────────────────
exports.getPurchases = asyncHandler(async (req, res) => {
  const { status, supplier, from, to, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (supplier) filter.supplier = supplier;
  if (from || to) {
    filter.orderDate = {};
    if (from) filter.orderDate.$gte = new Date(from);
    if (to) filter.orderDate.$lte = new Date(to);
  }
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('supplier', 'name phone')
      .populate('warehouse', 'name')
      .sort('-orderDate').skip(skip).limit(parseInt(limit)),
    PurchaseOrder.countDocuments(filter)
  ]);
  const summary = await PurchaseOrder.aggregate([
    { $match: filter },
    { $group: { _id: null, totalAmount: { $sum: '$grandTotal' }, totalPaid: { $sum: '$paidAmount' }, count: { $sum: 1 } } }
  ]);
  res.json({ success: true, data: { orders, total, page: parseInt(page), pages: Math.ceil(total / limit), summary: summary[0] || {} } });
});

exports.createPurchase = asyncHandler(async (req, res) => {
  const poNumber = await counterService.next(req.companyId, 'PO');
  const po = await PurchaseOrder.create({
    ...req.body,
    poNumber,
    company: req.companyId,
    branch: req.branchId,
    createdBy: req.user._id
  });
  res.status(201).json({ success: true, message: 'Purchase order created.', data: { order: po } });
});

exports.getPurchaseById = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, company: req.companyId })
    .populate('supplier').populate('warehouse').populate('items.product', 'name sku')
    .populate('approvedBy', 'name');
  if (!po) throw new AppError('Purchase order not found', 404);
  res.json({ success: true, data: { order: po } });
});

exports.updatePurchase = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId, status: 'draft' },
    { ...req.body, updatedBy: req.user._id }, { new: true }
  );
  if (!po) throw new AppError('Purchase order not found or cannot be edited', 404);
  res.json({ success: true, data: { order: po } });
});

exports.deletePurchase = asyncHandler(async (req, res) => {
  await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId, status: 'draft' },
    { status: 'cancelled' }
  );
  res.json({ success: true, message: 'Purchase order cancelled.' });
});

exports.approvePurchase = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId, approvalStatus: 'pending' },
    { approvalStatus: 'approved', approvedBy: req.user._id, approvedAt: new Date(), status: 'confirmed' },
    { new: true }
  );
  if (!po) throw new AppError('PO not found or already processed', 404);
  res.json({ success: true, message: 'Purchase order approved.', data: { order: po } });
});

// ─── GRN - Goods Receipt Note ──────────────────────────────────────────────────
exports.createGRN = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, company: req.companyId });
  if (!po) throw new AppError('Purchase order not found', 404);
  if (!['confirmed', 'partial'].includes(po.status)) throw new AppError('PO must be confirmed before GRN', 400);
  
  const grnNumber = await counterService.next(req.companyId, 'GRN');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const grnItems = req.body.items || [];
    
    // Record stock for each received item
    for (const item of grnItems) {
      if (item.acceptedQty > 0) {
        await Inventory.findOneAndUpdate(
          { company: req.companyId, warehouse: po.warehouse, product: item.product },
          { $inc: { quantity: item.acceptedQty }, lastUpdated: new Date() },
          { upsert: true, session, new: true }
        );
        
        await StockMovement.create([{
          company: req.companyId,
          warehouse: po.warehouse,
          product: item.product,
          movementType: 'purchase',
          quantity: item.acceptedQty,
          costPrice: item.purchasePrice || 0,
          totalValue: item.acceptedQty * (item.purchasePrice || 0),
          referenceType: 'PurchaseOrder',
          referenceId: po._id,
          referenceNumber: po.poNumber,
          performedBy: req.user._id
        }], { session });
        
        // Update product stock
        const result = await Inventory.aggregate([
          { $match: { company: mongoose.Types.ObjectId(req.companyId), product: mongoose.Types.ObjectId(item.product) } },
          { $group: { _id: null, total: { $sum: '$quantity' } } }
        ]);
        await Product.findByIdAndUpdate(item.product, {
          currentStock: result[0]?.total || 0,
          availableStock: result[0]?.total || 0
        });
      }
    }
    
    const grn = await GRN.create([{
      ...req.body,
      grnNumber,
      purchaseOrder: po._id,
      supplier: po.supplier,
      warehouse: po.warehouse,
      company: req.companyId,
      status: 'received',
      receivedBy: req.user._id,
      createdBy: req.user._id
    }], { session });
    
    // Update PO status
    const totalReceived = po.items.reduce((s, i) => s + (i.receivedQty || 0), 0) + grnItems.reduce((s, i) => s + (i.acceptedQty || 0), 0);
    const totalOrdered = po.items.reduce((s, i) => s + i.orderedQty, 0);
    const newStatus = totalReceived >= totalOrdered ? 'received' : 'partial';
    
    await PurchaseOrder.findByIdAndUpdate(po._id, { status: newStatus, grns: [...po.grns, grn[0]._id] }, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({ success: true, message: 'GRN created. Stock updated.', data: { grn: grn[0] } });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// ─── Payment on Purchase ───────────────────────────────────────────────────────
exports.recordPayment = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, company: req.companyId });
  if (!po) throw new AppError('Purchase order not found', 404);
  
  const paymentNumber = await counterService.next(req.companyId, 'PAY');
  const payment = await Payment.create({
    ...req.body,
    company: req.companyId,
    branch: req.branchId,
    paymentNumber,
    paymentType: 'payment',
    partyType: 'supplier',
    party: po.supplier,
    createdBy: req.user._id
  });
  
  const newPaid = po.paidAmount + req.body.amount;
  await PurchaseOrder.findByIdAndUpdate(po._id, {
    paidAmount: newPaid,
    dueAmount: po.grandTotal - newPaid,
    paymentStatus: newPaid >= po.grandTotal ? 'paid' : 'partial'
  });
  
  res.status(201).json({ success: true, data: { payment } });
});

// ─── Smart Document OCR Scan ───────────────────────────────────────────────────
exports.ocrScan = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload an invoice image.', 400);
  }

  // Parse the uploaded invoice using OCR Service
  const ocrResult = await ocrService.processInvoiceImage(req.file.path);

  // Return parsed data so frontend can map it to a new PO Draft
  res.json({
    success: true,
    message: 'Invoice scanned and parsed successfully.',
    data: { ocrResult }
  });
});
