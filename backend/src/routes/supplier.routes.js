'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Supplier = require('../models/Supplier');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } }
    ];
  }
  const skip = (page - 1) * limit;
  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort('name').skip(skip).limit(parseInt(limit)),
    Supplier.countDocuments(filter)
  ]);
  res.json({ success: true, data: { suppliers, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const count = await Supplier.countDocuments({ company: req.companyId });
  req.body.code = req.body.code || `SUP-${String(count + 1).padStart(5, '0')}`;
  req.body.company = req.companyId;
  req.body.createdBy = req.user._id;
  const supplier = await Supplier.create(req.body);
  res.status(201).json({ success: true, data: { supplier } });
}));

router.route('/:id')
  .get(asyncHandler(async (req, res) => {
    const supplier = await Supplier.findOne({ _id: req.params.id, company: req.companyId });
    if (!supplier) throw new AppError('Supplier not found', 404);
    res.json({ success: true, data: { supplier } });
  }))
  .put(asyncHandler(async (req, res) => {
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    res.json({ success: true, data: { supplier } });
  }))
  .delete(asyncHandler(async (req, res) => {
    await Supplier.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, { isActive: false });
    res.json({ success: true, message: 'Supplier deactivated.' });
  }));

module.exports = router;
