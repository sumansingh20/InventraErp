'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// ─── Sales Routes (sales orders, quotations) ──────────────────────────────────
const salesRouter = express.Router();
const { SalesOrder, Quotation } = require('../models/CRM');
const counterService = require('../services/counter.service');
salesRouter.use(authenticate);

salesRouter.get('/orders', asyncHandler(async (req, res) => {
  const { status, customer, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (customer) filter.customer = customer;
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    SalesOrder.find(filter).populate('customer', 'name phone').sort('-createdAt').skip(skip).limit(parseInt(limit)),
    SalesOrder.countDocuments(filter)
  ]);
  res.json({ success: true, data: { orders, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
}));

salesRouter.post('/orders', asyncHandler(async (req, res) => {
  const soNumber = await counterService.next(req.companyId, 'SO');
  const order = await SalesOrder.create({ ...req.body, soNumber, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { order } });
}));

salesRouter.route('/orders/:id')
  .get(asyncHandler(async (req, res) => {
    const order = await SalesOrder.findOne({ _id: req.params.id, company: req.companyId })
      .populate('customer').populate('items.product', 'name sku').populate('salesPerson', 'name');
    if (!order) throw new AppError('Sales order not found', 404);
    res.json({ success: true, data: { order } });
  }))
  .put(asyncHandler(async (req, res) => {
    const order = await SalesOrder.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      req.body, { new: true }
    );
    res.json({ success: true, data: { order } });
  }));

// Quotations
salesRouter.get('/quotations', asyncHandler(async (req, res) => {
  const quotations = await Quotation.find({ company: req.companyId })
    .populate('customer', 'name').sort('-createdAt').limit(100);
  res.json({ success: true, data: { quotations } });
}));

salesRouter.post('/quotations', asyncHandler(async (req, res) => {
  const qNumber = await counterService.next(req.companyId, 'QT');
  const q = await Quotation.create({ ...req.body, quotationNumber: qNumber, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { quotation: q } });
}));

salesRouter.post('/quotations/:id/convert', asyncHandler(async (req, res) => {
  const q = await Quotation.findOne({ _id: req.params.id, company: req.companyId });
  if (!q) throw new AppError('Quotation not found', 404);
  
  const soNumber = await counterService.next(req.companyId, 'SO');
  const order = await SalesOrder.create({
    company: req.companyId,
    soNumber,
    customer: q.customer,
    items: q.items,
    grandTotal: q.grandTotal,
    quotation: q._id,
    status: 'confirmed',
    createdBy: req.user._id
  });
  
  await Quotation.findByIdAndUpdate(q._id, { status: 'converted', salesOrder: order._id });
  res.status(201).json({ success: true, data: { order } });
}));

module.exports = salesRouter;
