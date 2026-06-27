'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const serviceRecordSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  serial: { type: Schema.Types.ObjectId, ref: 'Serial', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  
  ticketNumber: { type: String, required: true, unique: true },
  issueDescription: { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'assigned', 'in_progress', 'waiting_parts', 'repaired', 'replaced', 'unrepairable', 'closed'],
    default: 'open'
  },
  
  assignedTechnician: { type: Schema.Types.ObjectId, ref: 'Employee' },
  
  isWarrantyClaim: { type: Boolean, default: false },
  estimatedCost: { type: Number, default: 0 },
  finalCost: { type: Number, default: 0 },
  
  resolutionNotes: String,
  
  receivedAt: { type: Date, default: Date.now },
  completedAt: Date,
  returnedToCustomerAt: Date,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

serviceRecordSchema.index({ company: 1, ticketNumber: 1 });
serviceRecordSchema.index({ serial: 1 });

const ServiceRecord = mongoose.model('ServiceRecord', serviceRecordSchema);
module.exports = ServiceRecord;
