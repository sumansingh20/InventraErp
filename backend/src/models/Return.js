'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const returnItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId },
  quantity: { type: Number, required: true },
  serial: { type: Schema.Types.ObjectId, ref: 'Serial' },
  reason: String,
  condition: {
    type: String,
    enum: ['good', 'damaged', 'defective', 'expired', 'open_box'],
    default: 'good'
  },
  refundAmount: { type: Number, default: 0 }
});

const returnSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  returnNumber: { type: String, required: true, unique: true },
  
  returnType: {
    type: String,
    enum: ['sales_return', 'purchase_return'],
    required: true
  },
  
  // For Sales Return
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  
  // For Purchase Return
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'received', 'refunded', 'rejected', 'completed'],
    default: 'pending'
  },
  
  items: [returnItemSchema],
  
  totalRefund: { type: Number, default: 0 },
  restockFee: { type: Number, default: 0 },
  
  notes: String,
  
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

returnSchema.index({ company: 1, returnNumber: 1 });

const Return = mongoose.model('Return', returnSchema);
module.exports = Return;
