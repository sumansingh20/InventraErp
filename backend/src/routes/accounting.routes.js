'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { Account, JournalEntry, LedgerEntry } = require('../models/Accounting');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { Expense } = require('../models/Notification');
const counterService = require('../services/counter.service');

const router = express.Router();
router.use(authenticate);

// ─── Chart of Accounts ─────────────────────────────────────────────────────────
router.get('/accounts', asyncHandler(async (req, res) => {
  const accounts = await Account.find({ company: req.companyId, isActive: true })
    .populate('parent', 'name code')
    .sort('code');
  res.json({ success: true, data: { accounts } });
}));

router.post('/accounts', asyncHandler(async (req, res) => {
  const account = await Account.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { account } });
}));

router.route('/accounts/:id')
  .put(asyncHandler(async (req, res) => {
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      req.body, { new: true }
    );
    res.json({ success: true, data: { account } });
  }))
  .delete(asyncHandler(async (req, res) => {
    const account = await Account.findOne({ _id: req.params.id, company: req.companyId });
    if (account?.isSystem) throw new AppError('Cannot delete system accounts', 400);
    await Account.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Account deactivated.' });
  }));

// ─── Journal Entries ───────────────────────────────────────────────────────────
router.get('/journal', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, from, to, type } = req.query;
  const filter = { company: req.companyId };
  if (type) filter.entryType = type;
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    JournalEntry.find(filter).populate('lines.account', 'name code').sort('-entryDate').skip(skip).limit(parseInt(limit)),
    JournalEntry.countDocuments(filter)
  ]);
  res.json({ success: true, data: { entries, total, page: parseInt(page) } });
}));

router.post('/journal', asyncHandler(async (req, res) => {
  // Validate balanced entry
  const totalDebit = req.body.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = req.body.lines.reduce((s, l) => s + (l.credit || 0), 0);
  
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError(`Journal entry is unbalanced. Debit: ${totalDebit}, Credit: ${totalCredit}`, 400);
  }
  
  const entryNumber = await counterService.next(req.companyId, 'JE');
  const entry = await JournalEntry.create({
    ...req.body,
    entryNumber,
    company: req.companyId,
    totalDebit,
    totalCredit,
    postedBy: req.user._id,
    postedAt: new Date(),
    createdBy: req.user._id
  });
  
  res.status(201).json({ success: true, data: { entry } });
}));

// ─── Ledger ────────────────────────────────────────────────────────────────────
router.get('/ledger', asyncHandler(async (req, res) => {
  const { accountId, from, to, page = 1, limit = 50 } = req.query;
  if (!accountId) throw new AppError('Account ID is required', 400);
  
  const filter = { company: req.companyId, account: accountId };
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  
  const account = await Account.findById(accountId);
  const entries = await LedgerEntry.find(filter).sort('entryDate').skip((page - 1) * limit).limit(parseInt(limit));
  
  const openingBalance = account?.openingBalance || 0;
  let runningBalance = openingBalance;
  const ledger = entries.map(e => {
    runningBalance = runningBalance + (e.debit || 0) - (e.credit || 0);
    return { ...e.toObject(), balance: runningBalance };
  });
  
  res.json({ success: true, data: { account, entries: ledger, openingBalance } });
}));

// ─── Trial Balance ─────────────────────────────────────────────────────────────
router.get('/trial-balance', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  
  const matchStage = { company: require('mongoose').Types.ObjectId(req.companyId) };
  if (from || to) {
    matchStage.entryDate = {};
    if (from) matchStage.entryDate.$gte = new Date(from);
    if (to) matchStage.entryDate.$lte = new Date(to);
  }
  
  const trialBalance = await LedgerEntry.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$account',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    },
    {
      $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' }
    },
    { $unwind: '$account' },
    {
      $project: {
        accountCode: '$account.code',
        accountName: '$account.name',
        accountType: '$account.accountType',
        normalBalance: '$account.normalBalance',
        totalDebit: 1,
        totalCredit: 1,
        netBalance: { $subtract: ['$totalDebit', '$totalCredit'] }
      }
    },
    { $sort: { accountCode: 1 } }
  ]);
  
  res.json({ success: true, data: { trialBalance } });
}));

// ─── Profit & Loss ─────────────────────────────────────────────────────────────
router.get('/profit-loss', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 3, 1); // April 1
  const toDate = to ? new Date(to) : new Date();
  
  const summary = await Invoice.aggregate([
    {
      $match: {
        company: require('mongoose').Types.ObjectId(req.companyId),
        status: 'active',
        invoiceType: { $in: ['sale', 'pos'] },
        invoiceDate: { $gte: fromDate, $lte: toDate }
      }
    },
    {
      $group: {
        _id: null,
        grossRevenue: { $sum: '$grandTotal' },
        totalTax: { $sum: '$totalTax' },
        taxableAmount: { $sum: '$taxableAmount' }
      }
    }
  ]);
  
  const purchases = await require('../models/PurchaseOrder').PurchaseOrder ? null : null;
  
  const expenses = await Expense.aggregate([
    {
      $match: {
        company: require('mongoose').Types.ObjectId(req.companyId),
        expenseDate: { $gte: fromDate, $lte: toDate }
      }
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  const totalRevenue = summary[0]?.taxableAmount || 0;
  const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
  
  res.json({
    success: true,
    data: {
      from: fromDate,
      to: toDate,
      revenue: {
        grossRevenue: summary[0]?.grossRevenue || 0,
        netRevenue: totalRevenue,
        totalTax: summary[0]?.totalTax || 0
      },
      expenses: {
        breakdown: expenses,
        total: totalExpenses
      },
      grossProfit: totalRevenue - totalExpenses,
      netProfit: totalRevenue - totalExpenses
    }
  });
}));

// ─── Balance Sheet ─────────────────────────────────────────────────────────────
router.get('/balance-sheet', asyncHandler(async (req, res) => {
  const { date } = req.query;
  const asOfDate = date ? new Date(date) : new Date();
  
  const accounts = await Account.find({ company: req.companyId, isActive: true });
  
  const balances = await LedgerEntry.aggregate([
    {
      $match: {
        company: require('mongoose').Types.ObjectId(req.companyId),
        entryDate: { $lte: asOfDate }
      }
    },
    {
      $group: {
        _id: '$account',
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' }
      }
    }
  ]);
  
  const balanceMap = {};
  balances.forEach(b => { balanceMap[b._id.toString()] = b.debit - b.credit; });
  
  const assets = accounts.filter(a => ['asset', 'bank', 'cash', 'accounts_receivable', 'stock', 'fixed_asset'].includes(a.accountType));
  const liabilities = accounts.filter(a => ['liability', 'accounts_payable', 'tax'].includes(a.accountType));
  const equity = accounts.filter(a => a.accountType === 'equity');
  
  const mapBalance = (accs) => accs.map(a => ({
    code: a.code, name: a.name, type: a.accountType,
    balance: (a.openingBalance || 0) + (balanceMap[a._id.toString()] || 0)
  }));
  
  const totalAssets = mapBalance(assets).reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = mapBalance(liabilities).reduce((s, a) => s + a.balance, 0);
  const totalEquity = mapBalance(equity).reduce((s, a) => s + a.balance, 0);
  
  res.json({
    success: true,
    data: {
      asOfDate,
      assets: mapBalance(assets),
      liabilities: mapBalance(liabilities),
      equity: mapBalance(equity),
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity
    }
  });
}));

// ─── Cash Book ─────────────────────────────────────────────────────────────────
router.get('/cash-book', asyncHandler(async (req, res) => {
  const { accountId, from, to } = req.query;
  
  const account = await Account.findOne({
    _id: accountId,
    company: req.companyId,
    isCashAccount: true
  }) || await Account.findOne({ company: req.companyId, isCashAccount: true });
  
  if (!account) throw new AppError('Cash account not found', 404);
  
  const filter = { company: req.companyId, account: account._id };
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  
  const entries = await LedgerEntry.find(filter).sort('entryDate');
  
  res.json({ success: true, data: { account, entries } });
}));

// ─── Expenses ─────────────────────────────────────────────────────────────────
router.get('/expenses', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, from, to, category } = req.query;
  const filter = { company: req.companyId };
  if (category) filter.category = category;
  if (from || to) {
    filter.expenseDate = {};
    if (from) filter.expenseDate.$gte = new Date(from);
    if (to) filter.expenseDate.$lte = new Date(to);
  }
  const skip = (page - 1) * limit;
  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort('-expenseDate').skip(skip).limit(parseInt(limit)),
    Expense.countDocuments(filter)
  ]);
  res.json({ success: true, data: { expenses, total } });
}));

router.post('/expenses', asyncHandler(async (req, res) => {
  const expNumber = await counterService.next(req.companyId, 'EXP');
  const expense = await Expense.create({
    ...req.body,
    expenseNumber: expNumber,
    company: req.companyId,
    branch: req.branchId,
    createdBy: req.user._id
  });
  res.status(201).json({ success: true, data: { expense } });
}));

module.exports = router;
