'use strict';

const mongoose = require('mongoose');
const logger = require('../config/logger');

// Counter collection for auto-numbering
const counterSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  prefix: { type: String, required: true },
  sequence: { type: Number, default: 0 },
  year: Number,
  month: Number,
  format: { type: String, default: '{PREFIX}-{SEQ:5}' }
}, { timestamps: true });

counterSchema.index({ company: 1, prefix: 1 }, { unique: true });

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Get next sequential number for a given prefix
 * @param {string} companyId 
 * @param {string} prefix - 'INV', 'PO', 'SO', 'JE', 'REC', 'PAY', 'GRN', etc.
 * @param {object} options
 */
const next = async (companyId, prefix, options = {}) => {
  const { resetYearly = false, resetMonthly = false } = options;
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  const filter = { company: companyId, prefix };
  
  // Check if we need to reset
  const existing = await Counter.findOne(filter);
  
  if (existing) {
    if (resetYearly && existing.year !== year) {
      // Reset sequence for new year
      await Counter.findOneAndUpdate(filter, { sequence: 0, year, month });
    } else if (resetMonthly && (existing.month !== month || existing.year !== year)) {
      await Counter.findOneAndUpdate(filter, { sequence: 0, year, month });
    }
  }
  
  // Atomic increment
  const counter = await Counter.findOneAndUpdate(
    filter,
    {
      $inc: { sequence: 1 },
      $setOnInsert: { year, month }
    },
    { upsert: true, new: true }
  );
  
  const seq = String(counter.sequence).padStart(5, '0');
  
  // Format: INV-2024-00001 or INV-00001
  if (options.includeYear) {
    return `${prefix}-${year}-${seq}`;
  }
  
  return `${prefix}-${seq}`;
};

/**
 * Reset counter for a prefix
 */
const reset = async (companyId, prefix, startFrom = 0) => {
  await Counter.findOneAndUpdate(
    { company: companyId, prefix },
    { sequence: startFrom },
    { upsert: true }
  );
};

/**
 * Get current sequence without incrementing
 */
const current = async (companyId, prefix) => {
  const counter = await Counter.findOne({ company: companyId, prefix });
  return counter?.sequence || 0;
};

module.exports = { next, reset, current, Counter };
