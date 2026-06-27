'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Chart of Accounts
const accountSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  code: { type: String, required: true },
  name: { type: String, required: true },
  
  // Account type hierarchy
  accountType: {
    type: String,
    required: true,
    enum: [
      'asset', 'liability', 'equity', 'income', 'expense',
      'bank', 'cash', 'accounts_receivable', 'accounts_payable',
      'fixed_asset', 'stock', 'tax', 'other'
    ]
  },
  
  accountGroup: {
    type: String,
    enum: [
      'current_assets', 'fixed_assets', 'investments', 'current_liabilities',
      'long_term_liabilities', 'equity', 'revenue', 'cost_of_goods',
      'operating_expenses', 'other_income', 'other_expenses', 'tax'
    ]
  },
  
  // Parent account (for sub-ledger)
  parent: { type: Schema.Types.ObjectId, ref: 'Account' },
  level: { type: Number, default: 1 },
  path: String, // e.g., "1.1.3" for sorting
  
  // Balance
  openingBalance: { type: Number, default: 0 },
  openingBalanceType: { type: String, enum: ['debit', 'credit'], default: 'debit' },
  currentBalance: { type: Number, default: 0 },
  normalBalance: { type: String, enum: ['debit', 'credit'], default: 'debit' },
  
  // Bank specific
  bankName: String,
  accountNumber: String,
  ifscCode: String,
  
  // GST (for tax accounts)
  gstRate: Number,
  gstType: String,
  
  // Settings
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isBankAccount: { type: Boolean, default: false },
  isCashAccount: { type: Boolean, default: false },
  
  description: String,
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

accountSchema.index({ company: 1, code: 1 }, { unique: true });
accountSchema.index({ company: 1, accountType: 1 });
accountSchema.index({ company: 1, parent: 1 });
accountSchema.index({ company: 1, name: 'text' });

const Account = mongoose.model('Account', accountSchema);

// Journal Entry
const journalEntrySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  entryNumber: { type: String, required: true },
  
  entryType: {
    type: String,
    enum: ['manual', 'payment', 'receipt', 'invoice', 'purchase', 'expense', 'salary', 'adjustment', 'opening'],
    default: 'manual'
  },
  
  entryDate: { type: Date, required: true },
  narration: String,
  
  // Reference
  referenceType: String,
  referenceId: { type: Schema.Types.ObjectId },
  referenceNumber: String,
  
  // Lines (double-entry)
  lines: [{
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    accountName: String,
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    narration: String,
    costCenter: String
  }],
  
  totalDebit: { type: Number, default: 0 },
  totalCredit: { type: Number, default: 0 },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'posted', 'cancelled'],
    default: 'posted'
  },
  
  isAdjustment: { type: Boolean, default: false },
  isOpening: { type: Boolean, default: false },
  
  // Audit
  postedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  postedAt: Date,
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

journalEntrySchema.index({ company: 1, entryNumber: 1 }, { unique: true });
journalEntrySchema.index({ company: 1, entryDate: -1 });
journalEntrySchema.index({ company: 1, entryType: 1 });
journalEntrySchema.index({ referenceId: 1, referenceType: 1 });

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

// Ledger entry (for fast reporting)
const ledgerEntrySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  
  entryDate: { type: Date, required: true },
  narration: String,
  
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  
  referenceType: String,
  referenceId: { type: Schema.Types.ObjectId },
  referenceNumber: String,
  
  partyType: String,
  partyId: { type: Schema.Types.ObjectId },
  partyName: String
}, { timestamps: true });

ledgerEntrySchema.index({ company: 1, account: 1, entryDate: -1 });
ledgerEntrySchema.index({ company: 1, entryDate: -1 });

const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);

module.exports = { Account, JournalEntry, LedgerEntry };
