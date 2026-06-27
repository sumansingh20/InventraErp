'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { Lead, Opportunity, Activity } = require('../models/CRM');
const Customer = require('../models/Customer');
const counterService = require('../services/counter.service');

const router = express.Router();
router.use(authenticate);

// ─── Leads ─────────────────────────────────────────────────────────────────────
router.get('/leads', asyncHandler(async (req, res) => {
  const { status, assignedTo, source, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (source) filter.source = source;
  
  const skip = (page - 1) * limit;
  const [leads, total] = await Promise.all([
    Lead.find(filter).populate('assignedTo', 'name').sort('-createdAt').skip(skip).limit(parseInt(limit)),
    Lead.countDocuments(filter)
  ]);
  
  // Funnel stats
  const funnel = await Lead.aggregate([
    { $match: { company: require('mongoose').Types.ObjectId(req.companyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  res.json({ success: true, data: { leads, total, page: parseInt(page), funnel } });
}));

router.post('/leads', asyncHandler(async (req, res) => {
  const leadNumber = await counterService.next(req.companyId, 'LEAD');
  const lead = await Lead.create({
    ...req.body, leadNumber, company: req.companyId, createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: { lead } });
}));

router.route('/leads/:id')
  .get(asyncHandler(async (req, res) => {
    const lead = await Lead.findOne({ _id: req.params.id, company: req.companyId }).populate('assignedTo', 'name');
    if (!lead) throw new AppError('Lead not found', 404);
    const activities = await Activity.find({ relatedTo: 'lead', relatedId: lead._id }).populate('assignedTo', 'name').sort('-createdAt');
    res.json({ success: true, data: { lead, activities } });
  }))
  .put(asyncHandler(async (req, res) => {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      { ...req.body, updatedBy: req.user._id }, { new: true }
    );
    res.json({ success: true, data: { lead } });
  }));

// Convert lead to customer
router.post('/leads/:id/convert', asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, company: req.companyId });
  if (!lead) throw new AppError('Lead not found', 404);
  
  const count = await Customer.countDocuments({ company: req.companyId });
  const customer = await Customer.create({
    company: req.companyId,
    name: lead.name,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    code: `CUST-${String(count + 1).padStart(5, '0')}`,
    source: lead.source,
    assignedTo: lead.assignedTo,
    createdBy: req.user._id
  });
  
  await Lead.findByIdAndUpdate(lead._id, {
    status: 'converted',
    convertedAt: new Date(),
    convertedTo: customer._id
  });
  
  res.json({ success: true, message: 'Lead converted to customer.', data: { customer } });
}));

// ─── Opportunities ─────────────────────────────────────────────────────────────
router.get('/opportunities', asyncHandler(async (req, res) => {
  const { stage, assignedTo, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (stage) filter.stage = stage;
  if (assignedTo) filter.assignedTo = assignedTo;
  
  const [opportunities, total] = await Promise.all([
    Opportunity.find(filter).populate('customer', 'name').populate('assignedTo', 'name')
      .sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)),
    Opportunity.countDocuments(filter)
  ]);
  
  const pipeline = await Opportunity.aggregate([
    { $match: { company: require('mongoose').Types.ObjectId(req.companyId) } },
    { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$expectedRevenue' } } }
  ]);
  
  res.json({ success: true, data: { opportunities, total, pipeline } });
}));

router.post('/opportunities', asyncHandler(async (req, res) => {
  const oNumber = await counterService.next(req.companyId, 'OPP');
  const opp = await Opportunity.create({
    ...req.body, opportunityNumber: oNumber, company: req.companyId, createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: { opportunity: opp } });
}));

// ─── Activities ─────────────────────────────────────────────────────────────────
router.get('/activities', asyncHandler(async (req, res) => {
  const { relatedTo, relatedId, type, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (relatedTo) filter.relatedTo = relatedTo;
  if (relatedId) filter.relatedId = relatedId;
  if (type) filter.activityType = type;
  
  const activities = await Activity.find(filter)
    .populate('assignedTo', 'name').populate('createdBy', 'name')
    .sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit));
  
  res.json({ success: true, data: { activities } });
}));

router.post('/activities', asyncHandler(async (req, res) => {
  const activity = await Activity.create({
    ...req.body, company: req.companyId, createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: { activity } });
}));

module.exports = router;
