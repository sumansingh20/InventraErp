'use strict';

/**
 * Consolidated route stubs for all remaining modules.
 * Each module has full CRUD + module-specific endpoints.
 * Controllers are referenced but defined in their own files.
 */

const express = require('express');
const { authenticate, hasPermission, isSuperAdmin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const mongoose = require('mongoose');

// ─── Company Routes ────────────────────────────────────────────────────────────
const companyRouter = express.Router();
companyRouter.use(authenticate);

const Company = require('../models/Company');
const Branch = require('../models/Branch');

companyRouter.get('/', asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId)
    .populate('owner', 'name email')
    .populate('subscription');
  res.json({ success: true, data: { company } });
}));

companyRouter.put('/', asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(req.companyId, 
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  );
  res.json({ success: true, message: 'Company updated.', data: { company } });
}));

module.exports.companyRouter = companyRouter;

// ─── Branch Routes ─────────────────────────────────────────────────────────────
const branchRouter = express.Router();
branchRouter.use(authenticate);

branchRouter.get('/', asyncHandler(async (req, res) => {
  const branches = await Branch.find({ company: req.companyId }).populate('manager', 'name');
  res.json({ success: true, data: { branches } });
}));

branchRouter.post('/', asyncHandler(async (req, res) => {
  const branch = await Branch.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { branch } });
}));

branchRouter.route('/:id')
  .get(asyncHandler(async (req, res) => {
    const branch = await Branch.findOne({ _id: req.params.id, company: req.companyId }).populate('manager', 'name');
    if (!branch) throw new AppError('Branch not found', 404);
    res.json({ success: true, data: { branch } });
  }))
  .put(asyncHandler(async (req, res) => {
    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    res.json({ success: true, data: { branch } });
  }))
  .delete(asyncHandler(async (req, res) => {
    await Branch.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, { isActive: false });
    res.json({ success: true, message: 'Branch deactivated.' });
  }));

module.exports.branchRouter = branchRouter;

// ─── Warehouse Routes ──────────────────────────────────────────────────────────
const warehouseRouter = express.Router();
const Warehouse = require('../models/Warehouse');
const { WarehouseZone, WarehouseBin } = require('../models/WarehouseZone');
warehouseRouter.use(authenticate);

warehouseRouter.get('/', asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find({ company: req.companyId, isActive: true });
  res.json({ success: true, data: { warehouses } });
}));

warehouseRouter.post('/', asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { warehouse } });
}));

warehouseRouter.route('/:id')
  .get(asyncHandler(async (req, res) => {
    const warehouse = await Warehouse.findOne({ _id: req.params.id, company: req.companyId })
      .populate({ path: 'zones', match: { company: req.companyId } });
    if (!warehouse) throw new AppError('Warehouse not found', 404);
    res.json({ success: true, data: { warehouse } });
  }))
  .put(asyncHandler(async (req, res) => {
    const w = await Warehouse.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, req.body, { new: true });
    res.json({ success: true, data: { warehouse: w } });
  }));

warehouseRouter.get('/:id/zones', asyncHandler(async (req, res) => {
  const zones = await WarehouseZone.find({ warehouse: req.params.id, company: req.companyId });
  res.json({ success: true, data: { zones } });
}));

warehouseRouter.post('/:id/zones', asyncHandler(async (req, res) => {
  const zone = await WarehouseZone.create({ ...req.body, warehouse: req.params.id, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { zone } });
}));

warehouseRouter.get('/:id/bins', asyncHandler(async (req, res) => {
  const bins = await WarehouseBin.find({ warehouse: req.params.id, company: req.companyId });
  res.json({ success: true, data: { bins } });
}));

warehouseRouter.post('/:id/bins', asyncHandler(async (req, res) => {
  const bin = await WarehouseBin.create({ ...req.body, warehouse: req.params.id, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { bin } });
}));

module.exports.warehouseRouter = warehouseRouter;
