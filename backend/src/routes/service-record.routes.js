'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ServiceRecord = require('../models/ServiceRecord');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// List service records
router.get('/', async (req, res) => {
  try {
    const { status, technician, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company };
    if (status) filter.status = status;
    if (technician) filter.assignedTechnician = technician;

    const [records, total] = await Promise.all([
      ServiceRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('serial', 'serialNumber imei1 imei2')
        .populate('product', 'name')
        .populate('customer', 'name phone')
        .populate('assignedTechnician', 'name'),
      ServiceRecord.countDocuments(filter)
    ]);

    res.json({ success: true, data: records, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create service record
router.post('/', async (req, res) => {
  try {
    // Generate ticket number
    const count = await ServiceRecord.countDocuments({ company: req.user.company });
    const ticketNumber = `SRV-${String(count + 1).padStart(5, '0')}`;

    const record = await ServiceRecord.create({
      ...req.body,
      company: req.user.company,
      ticketNumber,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: record, message: 'Service ticket created' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get single service record
router.get('/:id', async (req, res) => {
  try {
    const record = await ServiceRecord.findOne({ _id: req.params.id, company: req.user.company })
      .populate('serial', 'serialNumber imei1 imei2 warrantyExpiry')
      .populate('product', 'name sku')
      .populate('customer', 'name phone email')
      .populate('assignedTechnician', 'name designation');
    if (!record) return res.status(404).json({ success: false, message: 'Service record not found' });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update service record
router.put('/:id', async (req, res) => {
  try {
    const record = await ServiceRecord.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Service record not found' });
    res.json({ success: true, data: record, message: 'Service record updated' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
