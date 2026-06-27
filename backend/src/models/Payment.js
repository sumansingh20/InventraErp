'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  // Payment number
  paymentNumber: { type: String, required: true },
  
  // Type
  paymentType: {
    type: String,
    enum: ['receipt', 'payment', 'journal'], // receipt = money in, payment = money out
    required: true
  },
  
  // Party
  partyType: { type: String, enum: ['customer', 'supplier', 'employee', 'other'] },
  party: { type: Schema.Types.ObjectId }, // ref to Customer or Supplier
  partyName: String,
  
  // Amount
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  exchangeRate: { type: Number, default: 1 },
  
  // Payment method
  paymentMode: {
    type: String,
    enum: ['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'wallet', 'razorpay', 'paytm', 'phonepe', 'cashfree', 'stripe', 'paypal', 'emi', 'credit', 'advance', 'other'],
    required: true
  },
  
  // Payment details
  referenceNumber: String, // Cheque no, transaction ID, UPI ref
  bankName: String,
  cardType: String, // Visa, MC, Amex
  cardLastFour: String,
  transactionId: String, // Gateway txn ID
  gatewayOrderId: String,
  gatewayPaymentId: String,
  gatewaySignature: String,
  
  // Bank account used
  bankAccount: { type: Schema.Types.ObjectId },
  
  // Date
  paymentDate: { type: Date, default: Date.now },
  valueDate: Date, // for cheques
  
  // Invoice allocation
  allocations: [{
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: String,
    allocatedAmount: Number
  }],
  
  // Accounting
  debitAccount: { type: Schema.Types.ObjectId, ref: 'Account' },
  creditAccount: { type: Schema.Types.ObjectId, ref: 'Account' },
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  
  // TDS
  tdsDeducted: { type: Boolean, default: false },
  tdsAmount: { type: Number, default: 0 },
  tdsSection: String,
  tdsRate: { type: Number, default: 0 },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'completed'
  },
  failureReason: String,
  
  // Notes
  notes: String,
  narration: String,
  
  // POS
  isPOS: { type: Boolean, default: false },
  cashierName: String,
  
  // Attachments
  attachments: [String],
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

paymentSchema.index({ company: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ company: 1, party: 1, partyType: 1 });
paymentSchema.index({ company: 1, paymentDate: -1 });
paymentSchema.index({ company: 1, paymentMode: 1 });
paymentSchema.index({ transactionId: 1 }, { sparse: true });

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
