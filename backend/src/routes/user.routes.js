'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Role = require('../models/Role');

const router = express.Router();
router.use(authenticate);

// Users (company)
router.get('/', asyncHandler(async (req, res) => {
  const users = await User.find({ company: req.companyId }).populate('role', 'name slug').select('-password -refreshToken').sort('name');
  res.json({ success: true, data: { users } });
}));

router.post('/', asyncHandler(async (req, res) => {
  req.body.company = req.companyId;
  req.body.branch = req.branchId;
  req.body.createdBy = req.user._id;
  const user = await User.create(req.body);
  const userObj = user.toObject();
  delete userObj.password;
  res.status(201).json({ success: true, data: { user: userObj } });
}));

router.route('/:id')
  .get(asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, company: req.companyId }).populate('role').select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  }))
  .put(asyncHandler(async (req, res) => {
    delete req.body.password; // Password changes done separately
    const user = await User.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, req.body, { new: true }).select('-password');
    res.json({ success: true, data: { user } });
  }))
  .delete(asyncHandler(async (req, res) => {
    await User.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, { isActive: false });
    res.json({ success: true, message: 'User deactivated.' });
  }));

// Roles
router.get('/roles', asyncHandler(async (req, res) => {
  const roles = await Role.find({ $or: [{ company: req.companyId }, { company: null, isSystem: true }] });
  res.json({ success: true, data: { roles } });
}));

router.post('/roles', asyncHandler(async (req, res) => {
  const role = await Role.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { role } });
}));

router.put('/roles/:id', asyncHandler(async (req, res) => {
  const role = await Role.findOneAndUpdate({ _id: req.params.id, company: req.companyId, isSystem: { $ne: true } }, req.body, { new: true });
  res.json({ success: true, data: { role } });
}));

module.exports = router;
