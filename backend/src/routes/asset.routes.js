'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Asset = require('../models/Asset');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// List assets
router.get('/', async (req, res) => {
  try {
    const { assetType, status, assignedTo, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company, isActive: true };
    if (assetType) filter.assetType = assetType;
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;

    const [assets, total] = await Promise.all([
      Asset.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name employeeId'),
      Asset.countDocuments(filter)
    ]);

    res.json({ success: true, data: assets, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create asset
router.post('/', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const asset = await Asset.create({ ...req.body, company: req.user.company, createdBy: req.user._id });
    res.status(201).json({ success: true, data: asset, message: 'Asset created' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get single asset
router.get('/:id', async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, company: req.user.company })
      .populate('assignedTo', 'name employeeId designation');
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, data: asset });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update asset
router.put('/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body, { new: true }
    );
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, data: asset, message: 'Asset updated' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Assign asset to employee
router.patch('/:id/assign', requireRole(['admin', 'company_owner', 'hr_manager']), async (req, res) => {
  try {
    const { employeeId } = req.body;
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { assignedTo: employeeId, assignedAt: new Date(), status: 'assigned' },
      { new: true }
    ).populate('assignedTo', 'name employeeId');
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, data: asset, message: 'Asset assigned successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Add maintenance record
router.post('/:id/maintenance', async (req, res) => {
  try {
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $push: { maintenanceHistory: req.body } },
      { new: true }
    );
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, data: asset });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
