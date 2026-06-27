'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Bill of Materials
const bomSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  bomNumber: String,
  name: { type: String, required: true },
  
  // Finished Product
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId },
  quantity: { type: Number, default: 1 }, // output quantity
  unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
  
  // Raw Materials / Components
  components: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId },
    quantity: { type: Number, required: true },
    unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
    scrapRate: { type: Number, default: 0 }, // % wastage
    costPrice: Number,
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' }
  }],
  
  // Operations / Steps
  operations: [{
    step: Number,
    name: String,
    description: String,
    machine: String,
    duration: Number, // minutes
    cost: Number
  }],
  
  // Overhead costs
  overheadCost: { type: Number, default: 0 },
  laborCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  notes: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

bomSchema.index({ company: 1, product: 1 });
const BOM = mongoose.model('BOM', bomSchema);

// Manufacturing / Work Order
const workOrderSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
  
  woNumber: { type: String, required: true },
  
  bom: { type: Schema.Types.ObjectId, ref: 'BOM', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  
  // Quantities
  plannedQty: { type: Number, required: true },
  producedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  
  // Dates
  plannedStart: Date,
  plannedEnd: Date,
  actualStart: Date,
  actualEnd: Date,
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'in_progress', 'on_hold', 'done', 'cancelled'],
    default: 'draft'
  },
  
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  
  // Materials
  rawMaterials: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    plannedQty: Number,
    consumedQty: { type: Number, default: 0 },
    unit: { type: Schema.Types.ObjectId, ref: 'Unit' },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    costPrice: Number
  }],
  
  // Costs
  materialCost: { type: Number, default: 0 },
  laborCost: { type: Number, default: 0 },
  overheadCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  costPerUnit: { type: Number, default: 0 },
  
  // Quality
  qualityChecks: [{
    parameter: String,
    standard: String,
    actual: String,
    passed: Boolean,
    checkedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkedAt: Date
  }],
  
  // Assignment
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  
  notes: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

workOrderSchema.index({ company: 1, woNumber: 1 }, { unique: true });
workOrderSchema.index({ company: 1, status: 1 });
workOrderSchema.index({ company: 1, product: 1 });

const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);

module.exports = { BOM, WorkOrder };
