'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Return = require('../models/Return');
const { generateReturnNumber } = require('../services/counter.service');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// List returns
router.get('/', async (req, res) => {
  try {
    const { returnType, status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company };
    if (returnType) filter.returnType = returnType;
    if (status) filter.status = status;

    const [returns, total] = await Promise.all([
      Return.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('customer', 'name phone')
        .populate('supplier', 'name phone')
        .populate('invoice', 'invoiceNumber')
        .populate('purchaseOrder', 'poNumber'),
      Return.countDocuments(filter)
    ]);

    res.json({ success: true, data: returns, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create return
router.post('/', async (req, res) => {
  try {
    const returnNumber = await generateReturnNumber(req.user.company);
    const ret = await Return.create({
      ...req.body,
      company: req.user.company,
      returnNumber,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: ret, message: 'Return created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get single return
router.get('/:id', async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, company: req.user.company })
      .populate('customer', 'name phone email')
      .populate('supplier', 'name phone')
      .populate('items.product', 'name sku')
      .populate('createdBy', 'name');
    if (!ret) return res.status(404).json({ success: false, message: 'Return not found' });
    res.json({ success: true, data: ret });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update return status
router.patch('/:id/status', requireRole(['admin', 'company_owner', 'inventory_manager']), async (req, res) => {
  try {
    const { status } = req.body;
    const ret = await Return.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status, processedBy: req.user._id },
      { new: true }
    );
    if (!ret) return res.status(404).json({ success: false, message: 'Return not found' });
    res.json({ success: true, data: ret });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
