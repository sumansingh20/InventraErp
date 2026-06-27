'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { BOM, WorkOrder } = require('../models/Manufacturing');
const Product = require('../models/Product');
const { Inventory } = require('../models/Inventory');
const counterService = require('../services/counter.service');
const mongoose = require('mongoose');

const router = express.Router();
router.use(authenticate);

// ─── Bill of Materials ─────────────────────────────────────────────────────────
router.get('/bom', asyncHandler(async (req, res) => {
  const boms = await BOM.find({ company: req.companyId, isActive: true })
    .populate('product', 'name sku').populate('components.product', 'name sku').sort('name');
  res.json({ success: true, data: { boms } });
}));

router.post('/bom', asyncHandler(async (req, res) => {
  const bom = await BOM.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { bom } });
}));

router.route('/bom/:id')
  .get(asyncHandler(async (req, res) => {
    const bom = await BOM.findOne({ _id: req.params.id, company: req.companyId })
      .populate('product', 'name sku unit')
      .populate('components.product', 'name sku currentStock')
      .populate('components.unit', 'shortName');
    if (!bom) throw new AppError('BOM not found', 404);
    res.json({ success: true, data: { bom } });
  }))
  .put(asyncHandler(async (req, res) => {
    const bom = await BOM.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, req.body, { new: true });
    res.json({ success: true, data: { bom } });
  }));

// ─── Work Orders ───────────────────────────────────────────────────────────────
router.get('/work-orders', asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    WorkOrder.find(filter).populate('product', 'name sku').populate('bom', 'name').sort('-createdAt').skip(skip).limit(parseInt(limit)),
    WorkOrder.countDocuments(filter)
  ]);
  res.json({ success: true, data: { orders, total } });
}));

router.post('/work-orders', asyncHandler(async (req, res) => {
  // Validate material availability
  const bom = await BOM.findOne({ _id: req.body.bom, company: req.companyId });
  if (!bom) throw new AppError('BOM not found', 404);
  
  const warehouseId = req.body.warehouse;
  for (const comp of bom.components) {
    const needed = comp.quantity * req.body.plannedQty;
    const inv = await Inventory.findOne({ company: req.companyId, warehouse: warehouseId, product: comp.product });
    if (!inv || inv.quantity < needed) {
      const prod = await Product.findById(comp.product).select('name');
      throw new AppError(`Insufficient stock for ${prod?.name}. Needed: ${needed}, Available: ${inv?.quantity || 0}`, 400);
    }
  }
  
  const woNumber = await counterService.next(req.companyId, 'WO');
  const wo = await WorkOrder.create({
    ...req.body,
    woNumber,
    company: req.companyId,
    product: bom.product,
    rawMaterials: bom.components.map(c => ({
      product: c.product,
      plannedQty: c.quantity * req.body.plannedQty,
      unit: c.unit,
      warehouse: warehouseId
    })),
    createdBy: req.user._id
  });
  
  res.status(201).json({ success: true, data: { workOrder: wo } });
}));

router.route('/work-orders/:id')
  .get(asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findOne({ _id: req.params.id, company: req.companyId })
      .populate('bom').populate('product', 'name sku')
      .populate('rawMaterials.product', 'name sku currentStock')
      .populate('assignedTo', 'name');
    if (!wo) throw new AppError('Work order not found', 404);
    res.json({ success: true, data: { workOrder: wo } });
  }));

// Start production
router.post('/work-orders/:id/start', asyncHandler(async (req, res) => {
  const wo = await WorkOrder.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId, status: 'confirmed' },
    { status: 'in_progress', actualStart: new Date() },
    { new: true }
  );
  if (!wo) throw new AppError('Work order not found or cannot be started', 404);
  res.json({ success: true, data: { workOrder: wo } });
}));

// Complete production
router.post('/work-orders/:id/complete', asyncHandler(async (req, res) => {
  const { producedQty, qualityChecks } = req.body;
  
  const wo = await WorkOrder.findOne({ _id: req.params.id, company: req.companyId });
  if (!wo || wo.status !== 'in_progress') throw new AppError('Work order not in progress', 400);
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { StockMovement } = require('../models/Inventory');
    
    // Consume raw materials
    for (const material of wo.rawMaterials) {
      const consumeQty = material.consumedQty || material.plannedQty;
      await Inventory.findOneAndUpdate(
        { company: req.companyId, warehouse: wo.warehouse, product: material.product },
        { $inc: { quantity: -consumeQty }, lastUpdated: new Date() },
        { session }
      );
      await StockMovement.create([{
        company: req.companyId, warehouse: wo.warehouse, product: material.product,
        movementType: 'production_out', quantity: consumeQty,
        referenceType: 'WorkOrder', referenceId: wo._id, referenceNumber: wo.woNumber,
        performedBy: req.user._id
      }], { session });
    }
    
    // Add finished goods to inventory
    await Inventory.findOneAndUpdate(
      { company: req.companyId, warehouse: wo.warehouse, product: wo.product },
      { $inc: { quantity: producedQty }, lastUpdated: new Date(), company: req.companyId, warehouse: wo.warehouse, product: wo.product },
      { upsert: true, session }
    );
    
    await StockMovement.create([{
      company: req.companyId, warehouse: wo.warehouse, product: wo.product,
      movementType: 'production_in', quantity: producedQty,
      referenceType: 'WorkOrder', referenceId: wo._id, referenceNumber: wo.woNumber,
      performedBy: req.user._id
    }], { session });
    
    // Update product stock
    const result = await Inventory.aggregate([
      { $match: { company: mongoose.Types.ObjectId(req.companyId), product: mongoose.Types.ObjectId(wo.product.toString()) } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]);
    await Product.findByIdAndUpdate(wo.product, { currentStock: result[0]?.total || 0 });
    
    await WorkOrder.findByIdAndUpdate(wo._id, {
      status: 'done', producedQty, actualEnd: new Date(), qualityChecks: qualityChecks || []
    }, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.json({ success: true, message: 'Production completed. Stock updated.', data: { producedQty } });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}));

module.exports = router;
