'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const warrantySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  duration: { type: Number, required: true }, // e.g. 12
  period: { 
    type: String, 
    enum: ['days', 'weeks', 'months', 'years'],
    default: 'months'
  },
  description: String,
  type: {
    type: String,
    enum: ['manufacturer', 'seller', 'extended'],
    default: 'manufacturer'
  },
  termsAndConditions: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

warrantySchema.index({ company: 1 });

const Warranty = mongoose.model('Warranty', warrantySchema);
module.exports = Warranty;
