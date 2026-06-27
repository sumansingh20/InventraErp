'use strict';

const express = require('express');
const { authenticate, hasPermission } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Customer = require('../models/Customer');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 25, isActive } = req.query;
  const filter = { company: req.companyId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } }
    ];
  }
  const skip = (page - 1) * limit;
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort('name').skip(skip).limit(parseInt(limit)),
    Customer.countDocuments(filter)
  ]);
  res.json({ success: true, data: { customers, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
}));

router.post('/', asyncHandler(async (req, res) => {
  // Auto-generate customer code
  const count = await Customer.countDocuments({ company: req.companyId });
  req.body.code = req.body.code || `CUST-${String(count + 1).padStart(5, '0')}`;
  req.body.company = req.companyId;
  req.body.createdBy = req.user._id;
  
  const customer = await Customer.create(req.body);
  res.status(201).json({ success: true, message: 'Customer created.', data: { customer } });
}));

router.route('/:id')
  .get(asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
    if (!customer) throw new AppError('Customer not found', 404);
    
    // Get purchase history summary
    const Invoice = require('../models/Invoice');
    const recentInvoices = await Invoice.find({ customer: customer._id, company: req.companyId })
      .select('invoiceNumber invoiceDate grandTotal paymentStatus')
      .sort('-invoiceDate')
      .limit(10);
    
    res.json({ success: true, data: { customer, recentInvoices } });
  }))
  .put(asyncHandler(async (req, res) => {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!customer) throw new AppError('Customer not found', 404);
    res.json({ success: true, data: { customer } });
  }))
  .delete(asyncHandler(async (req, res) => {
    await Customer.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, { isActive: false });
    res.json({ success: true, message: 'Customer deactivated.' });
  }));

// Ledger
router.get('/:id/ledger', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const Invoice = require('../models/Invoice');
  const Payment = require('../models/Payment');
  
  const invoiceFilter = { customer: req.params.id, company: req.companyId, status: { $ne: 'cancelled' } };
  if (from) invoiceFilter.invoiceDate = { $gte: new Date(from) };
  if (to) invoiceFilter.invoiceDate = { ...invoiceFilter.invoiceDate, $lte: new Date(to) };
  
  const invoices = await Invoice.find(invoiceFilter).select('invoiceNumber invoiceDate grandTotal paidAmount dueAmount paymentStatus').sort('invoiceDate');
  const payments = await Payment.find({
    company: req.companyId,
    partyType: 'customer',
    party: req.params.id
  }).select('paymentNumber paymentDate amount paymentMode').sort('paymentDate');
  
  res.json({ success: true, data: { invoices, payments } });
}));

// Statement
router.get('/:id/statement', asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) throw new AppError('Customer not found', 404);
  
  res.json({ success: true, data: { customer, statement: [] } });
}));

module.exports = router;
