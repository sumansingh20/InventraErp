'use strict';

const Invoice = require('../models/Invoice');
const { SalesOrder } = require('../models/CRM');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const { Inventory, StockMovement } = require('../models/Inventory');
const Payment = require('../models/Payment');
const { Account, JournalEntry, LedgerEntry } = require('../models/Accounting');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { emitToCompany } = require('../socket');
const pdfService = require('../services/pdf.service');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');
const counterService = require('../services/counter.service');
const APIFeatures = require('../utils/apiFeatures');
const mongoose = require('mongoose');

// ─── Create Invoice ────────────────────────────────────────────────────────────
exports.createInvoice = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { customerId, items, payments, invoiceType = 'sale', ...invoiceData } = req.body;
    
    // Generate invoice number
    const invoiceNumber = await counterService.next(req.companyId, 'INV');
    
    // Get customer
    const customer = customerId
      ? await Customer.findOne({ _id: customerId, company: req.companyId })
      : null;
    
    // Calculate totals
    const calculatedItems = await calculateInvoiceItems(items, req.companyId);
    const totals = calculateTotals(calculatedItems, invoiceData);
    
    // Validate stock for sale invoices
    if (['sale', 'pos'].includes(invoiceType)) {
      await validateStock(calculatedItems, req.companyId, invoiceData.warehouse);
    }
    
    // Create invoice
    const invoice = await Invoice.create([{
      ...invoiceData,
      invoiceNumber,
      invoiceType,
      company: req.companyId,
      branch: req.branchId,
      customer: customer?._id,
      customerName: customer?.name || invoiceData.customerName,
      customerPhone: customer?.phone || invoiceData.customerPhone,
      customerGstin: customer?.gstin,
      items: calculatedItems,
      ...totals,
      createdBy: req.user._id,
      isPOS: invoiceType === 'pos'
    }], { session });
    
    const inv = invoice[0];
    
    // Deduct stock
    if (['sale', 'pos'].includes(invoiceType)) {
      for (const item of calculatedItems) {
        await deductStock(item, req.companyId, invoiceData.warehouse, inv._id, inv.invoiceNumber, req.user._id, session);
      }
    }
    
    // Process payments
    let paidAmount = 0;
    if (payments && payments.length > 0) {
      for (const payment of payments) {
        if (payment.amount > 0) {
          const paymentNumber = await counterService.next(req.companyId, 'REC');
          const paymentDoc = await Payment.create([{
            ...payment,
            company: req.companyId,
            branch: req.branchId,
            paymentNumber,
            paymentType: 'receipt',
            partyType: 'customer',
            party: customer?._id,
            partyName: customer?.name || invoiceData.customerName,
            allocations: [{ invoiceId: inv._id, invoiceNumber, allocatedAmount: payment.amount }],
            isPOS: invoiceType === 'pos',
            createdBy: req.user._id
          }], { session });
          
          paidAmount += payment.amount;
          
          // Create journal entry for payment
          await createPaymentJournalEntry(paymentDoc[0], req.companyId, session);
        }
      }
    }
    
    // Update payment status on invoice
    const paymentStatus = paidAmount >= totals.grandTotal ? 'paid'
      : paidAmount > 0 ? 'partial' : 'unpaid';
    
    await Invoice.findByIdAndUpdate(inv._id, {
      paidAmount,
      dueAmount: totals.grandTotal - paidAmount,
      paymentStatus
    }, { session });
    
    // Create sales journal entry
    await createSalesJournalEntry(inv, paidAmount, req.companyId, customer, session);
    
    // Update customer stats
    if (customer) {
      await Customer.findByIdAndUpdate(customer._id, {
        $inc: {
          totalOrders: 1,
          totalPurchaseAmount: totals.grandTotal,
          totalPaidAmount: paidAmount,
          totalOutstanding: totals.grandTotal - paidAmount
        },
        lastOrderDate: new Date()
      }, { session });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Populate invoice
    const fullInvoice = await Invoice.findById(inv._id)
      .populate('customer', 'name phone email')
      .populate('items.product', 'name sku')
      .populate('items.unit', 'shortName')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name');
    
    // Generate PDF async
    pdfService.generateInvoicePdf(fullInvoice, req.companyId).then(pdfUrl => {
      Invoice.findByIdAndUpdate(inv._id, { pdfUrl }).exec();
    }).catch(err => {});
    
    // Send email if customer has email
    if (customer?.email && invoiceType !== 'pos') {
      emailService.sendInvoiceEmail(fullInvoice, customer).catch(() => {});
    }
    
    // Real-time update
    emitToCompany(req.companyId, 'invoice:created', {
      invoice: { _id: inv._id, invoiceNumber, grandTotal: totals.grandTotal, customer: customer?.name }
    });
    
    // Check low stock alerts
    for (const item of calculatedItems) {
      notificationService.checkLowStock(req.companyId, item.product).catch(() => {});
    }
    
    res.status(201).json({
      success: true,
      message: 'Invoice created successfully.',
      data: { invoice: fullInvoice }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// ─── Get All Invoices ──────────────────────────────────────────────────────────
exports.getInvoices = asyncHandler(async (req, res, next) => {
  const filter = {
    company: req.companyId,
    status: { $ne: 'void' }
  };
  
  // Apply filters from query
  if (req.query.invoiceType) filter.invoiceType = req.query.invoiceType;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.from || req.query.to) {
    filter.invoiceDate = {};
    if (req.query.from) filter.invoiceDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.invoiceDate.$lte = new Date(req.query.to);
  }
  if (req.query.search) {
    filter.$or = [
      { invoiceNumber: { $regex: req.query.search, $options: 'i' } },
      { customerName: { $regex: req.query.search, $options: 'i' } },
      { customerPhone: { $regex: req.query.search, $options: 'i' } }
    ];
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const skip = (page - 1) * limit;
  const sort = req.query.sort || '-invoiceDate';
  
  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('customer', 'name phone')
      .populate('warehouse', 'name')
      .select('-items')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter)
  ]);
  
  // Summary
  const summary = await Invoice.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        totalDue: { $sum: '$dueAmount' },
        totalInvoices: { $sum: 1 }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: {
      invoices,
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: summary[0] || { totalSales: 0, totalPaid: 0, totalDue: 0, totalInvoices: 0 }
    }
  });
});

// ─── Get Invoice by ID ─────────────────────────────────────────────────────────
exports.getInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    company: req.companyId
  })
    .populate('customer', 'name phone email billingAddress')
    .populate('warehouse', 'name address')
    .populate('items.product', 'name sku hsnCode')
    .populate('items.unit', 'name shortName')
    .populate('createdBy', 'name');
  
  if (!invoice) {
    return next(new AppError('Invoice not found.', 404));
  }
  
  // Get payments for this invoice
  const payments = await Payment.find({
    company: req.companyId,
    'allocations.invoiceId': invoice._id
  }).select('paymentNumber paymentDate amount paymentMode referenceNumber');
  
  res.json({ success: true, data: { invoice, payments } });
});

// ─── Cancel Invoice ────────────────────────────────────────────────────────────
exports.cancelInvoice = asyncHandler(async (req, res, next) => {
  const { cancelReason } = req.body;
  
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    company: req.companyId
  });
  
  if (!invoice) {
    return next(new AppError('Invoice not found.', 404));
  }
  
  if (['cancelled', 'void'].includes(invoice.status)) {
    return next(new AppError('Invoice is already cancelled.', 400));
  }
  
  if (invoice.paidAmount > 0) {
    return next(new AppError('Cannot cancel invoice with existing payments. Please process a return/refund first.', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Reverse stock
    for (const item of invoice.items) {
      if (item.product && item.quantity > 0) {
        const inv = await Inventory.findOneAndUpdate(
          { company: req.companyId, warehouse: invoice.warehouse, product: item.product },
          { $inc: { quantity: item.quantity }, lastUpdated: new Date() },
          { session, new: true }
        );
        
        await StockMovement.create([{
          company: req.companyId,
          warehouse: invoice.warehouse,
          product: item.product,
          movementType: 'adjustment_in',
          quantity: item.quantity,
          newStock: inv?.quantity || 0,
          notes: `Invoice ${invoice.invoiceNumber} cancelled`,
          performedBy: req.user._id
        }], { session });
      }
    }
    
    await Invoice.findByIdAndUpdate(invoice._id, {
      status: 'cancelled',
      cancelReason,
      updatedBy: req.user._id
    }, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    emitToCompany(req.companyId, 'invoice:cancelled', { invoiceId: invoice._id });
    
    res.json({ success: true, message: 'Invoice cancelled successfully.' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// ─── Download Invoice PDF ──────────────────────────────────────────────────────
exports.downloadPdf = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    company: req.companyId
  })
    .populate('customer')
    .populate('warehouse')
    .populate('items.product')
    .populate('items.unit')
    .populate('createdBy', 'name');
  
  if (!invoice) {
    return next(new AppError('Invoice not found.', 404));
  }
  
  const company = await require('../models/Company').findById(req.companyId);
  
  const pdfBuffer = await pdfService.generateInvoicePdfBuffer(invoice, company);
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
    'Content-Length': pdfBuffer.length
  });
  
  res.send(pdfBuffer);
});

// ─── POS Quick Bill ────────────────────────────────────────────────────────────
exports.posQuickBill = asyncHandler(async (req, res, next) => {
  req.body.invoiceType = 'pos';
  req.body.isPOS = true;
  return exports.createInvoice(req, res, next);
});

// ─── Record Payment ────────────────────────────────────────────────────────────
exports.recordPayment = asyncHandler(async (req, res, next) => {
  const { invoiceId, amount, paymentMode, referenceNumber, notes } = req.body;
  
  const invoice = await Invoice.findOne({ _id: invoiceId, company: req.companyId });
  if (!invoice) return next(new AppError('Invoice not found.', 404));
  
  if (amount > invoice.dueAmount) {
    return next(new AppError(`Payment amount exceeds outstanding due: ${invoice.dueAmount}`, 400));
  }
  
  const paymentNumber = await counterService.next(req.companyId, 'REC');
  
  const payment = await Payment.create({
    company: req.companyId,
    branch: req.branchId,
    paymentNumber,
    paymentType: 'receipt',
    partyType: 'customer',
    party: invoice.customer,
    partyName: invoice.customerName,
    amount,
    paymentMode,
    referenceNumber,
    notes,
    allocations: [{ invoiceId, invoiceNumber: invoice.invoiceNumber, allocatedAmount: amount }],
    createdBy: req.user._id
  });
  
  const newPaidAmount = invoice.paidAmount + amount;
  const newDueAmount = invoice.grandTotal - newPaidAmount;
  const paymentStatus = newDueAmount <= 0 ? 'paid' : 'partial';
  
  await Invoice.findByIdAndUpdate(invoiceId, {
    paidAmount: newPaidAmount,
    dueAmount: newDueAmount,
    paymentStatus
  });
  
  emitToCompany(req.companyId, 'payment:received', { invoiceId, amount, paymentStatus });
  
  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully.',
    data: { payment, paymentStatus }
  });
});

// ─── Sales Return ──────────────────────────────────────────────────────────────
exports.createSalesReturn = asyncHandler(async (req, res, next) => {
  const { originalInvoiceId, items, reason, refundMode } = req.body;
  
  const originalInvoice = await Invoice.findOne({
    _id: originalInvoiceId,
    company: req.companyId,
    status: 'active'
  });
  
  if (!originalInvoice) {
    return next(new AppError('Original invoice not found or cannot be returned.', 404));
  }
  
  // Validate return items
  for (const retItem of items) {
    const origItem = originalInvoice.items.find(i => i.product.toString() === retItem.product);
    if (!origItem) {
      return next(new AppError(`Product ${retItem.product} not found in original invoice.`, 400));
    }
    if (retItem.quantity > origItem.quantity) {
      return next(new AppError(`Return quantity cannot exceed invoiced quantity.`, 400));
    }
  }
  
  req.body.invoiceType = 'sale_return';
  req.body.originalInvoice = originalInvoiceId;
  req.body.customer = originalInvoice.customer;
  req.body.customerName = originalInvoice.customerName;
  
  return exports.createInvoice(req, res, next);
});

// ─── Helper Functions ──────────────────────────────────────────────────────────

async function calculateInvoiceItems(items, companyId) {
  return items.map(item => {
    const quantity = parseFloat(item.quantity) || 0;
    const sellingPrice = parseFloat(item.sellingPrice) || 0;
    const discountPct = parseFloat(item.discount) || 0;
    const taxRate = parseFloat(item.taxRate) || 0;
    const isInterState = item.isInterState || false;
    
    const discountAmount = (sellingPrice * quantity * discountPct) / 100;
    const taxableAmount = (sellingPrice * quantity) - discountAmount;
    
    const cgstRate = isInterState ? 0 : taxRate / 2;
    const sgstRate = isInterState ? 0 : taxRate / 2;
    const igstRate = isInterState ? taxRate : 0;
    
    const cgstAmount = (taxableAmount * cgstRate) / 100;
    const sgstAmount = (taxableAmount * sgstRate) / 100;
    const igstAmount = (taxableAmount * igstRate) / 100;
    const totalTax = cgstAmount + sgstAmount + igstAmount;
    
    return {
      ...item,
      discountAmount,
      taxableAmount,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTax,
      subtotal: sellingPrice * quantity,
      total: taxableAmount + totalTax
    };
  });
}

function calculateTotals(items, data) {
  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  const discountAmount = items.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
  const taxableAmount = items.reduce((sum, i) => sum + (i.taxableAmount || 0), 0);
  const totalTax = items.reduce((sum, i) => sum + (i.totalTax || 0), 0);
  const cgstAmount = items.reduce((sum, i) => sum + (i.cgstAmount || 0), 0);
  const sgstAmount = items.reduce((sum, i) => sum + (i.sgstAmount || 0), 0);
  const igstAmount = items.reduce((sum, i) => sum + (i.igstAmount || 0), 0);
  
  const shippingCharges = parseFloat(data.shippingCharges) || 0;
  const otherCharges = parseFloat(data.otherCharges) || 0;
  
  let grandTotal = taxableAmount + totalTax + shippingCharges + otherCharges;
  const roundOff = Math.round(grandTotal) - grandTotal;
  grandTotal = Math.round(grandTotal);
  
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    totalTax,
    cgstAmount,
    sgstAmount,
    igstAmount,
    shippingCharges,
    otherCharges,
    roundOff,
    grandTotal
  };
}

async function validateStock(items, companyId, warehouseId) {
  for (const item of items) {
    if (!item.product) continue;
    
    const inventory = await Inventory.findOne({
      company: companyId,
      warehouse: warehouseId,
      product: item.product
    });
    
    if (!inventory || inventory.quantity < item.quantity) {
      const product = await Product.findById(item.product).select('name');
      throw new AppError(`Insufficient stock for ${product?.name || item.product}. Available: ${inventory?.quantity || 0}`, 400);
    }
  }
}

async function deductStock(item, companyId, warehouseId, invoiceId, invoiceNumber, userId, session) {
  const inv = await Inventory.findOneAndUpdate(
    { company: companyId, warehouse: warehouseId, product: item.product },
    { $inc: { quantity: -item.quantity }, lastUpdated: new Date() },
    { session, new: true }
  );
  
  await StockMovement.create([{
    company: companyId,
    warehouse: warehouseId,
    product: item.product,
    movementType: 'sale',
    quantity: item.quantity,
    newStock: inv?.quantity || 0,
    costPrice: item.sellingPrice,
    totalValue: item.total,
    referenceType: 'Invoice',
    referenceId: invoiceId,
    referenceNumber: invoiceNumber,
    performedBy: userId
  }], { session });
  
  // Update product total stock
  const result = await Inventory.aggregate([
    { $match: { company: mongoose.Types.ObjectId(companyId), product: mongoose.Types.ObjectId(item.product) } },
    { $group: { _id: null, total: { $sum: '$quantity' } } }
  ]);
  
  await Product.findByIdAndUpdate(item.product, {
    currentStock: result[0]?.total || 0,
    availableStock: result[0]?.total || 0
  });
}

async function createSalesJournalEntry(invoice, paidAmount, companyId, customer, session) {
  try {
    const accounts = await Account.find({ company: companyId, isSystem: true });
    const arAccount = accounts.find(a => a.accountType === 'accounts_receivable');
    const salesAccount = accounts.find(a => a.code === '4100');
    const cashAccount = accounts.find(a => a.isCashAccount);
    
    if (!arAccount || !salesAccount) return;
    
    const { JournalEntry, LedgerEntry } = require('../models/Accounting');
    const counterService = require('../services/counter.service');
    
    const entryNumber = await counterService.next(companyId, 'JE');
    
    const lines = [
      { account: arAccount._id, accountName: arAccount.name, debit: invoice.grandTotal, credit: 0 },
      { account: salesAccount._id, accountName: salesAccount.name, debit: 0, credit: invoice.taxableAmount }
    ];
    
    // Add GST lines
    if (invoice.cgstAmount > 0) {
      const cgstAccount = accounts.find(a => a.name.includes('GST Payable'));
      if (cgstAccount) lines.push({ account: cgstAccount._id, accountName: 'GST Payable', debit: 0, credit: invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount });
    }
    
    await JournalEntry.create([{
      company: companyId,
      entryNumber,
      entryType: 'invoice',
      entryDate: invoice.invoiceDate || new Date(),
      narration: `Sale Invoice ${invoice.invoiceNumber}`,
      referenceType: 'Invoice',
      referenceId: invoice._id,
      referenceNumber: invoice.invoiceNumber,
      lines,
      totalDebit: invoice.grandTotal,
      totalCredit: invoice.grandTotal,
      status: 'posted'
    }], { session });
  } catch (err) {
    // Non-critical: don't throw
  }
}

async function createPaymentJournalEntry(payment, companyId, session) {
  // Simplified - full implementation creates proper double-entry
}
