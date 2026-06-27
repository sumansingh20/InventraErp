'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const permissionSchema = new Schema({
  module: { type: String, required: true }, // e.g., 'inventory', 'sales'
  actions: {
    create: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    approve: { type: Boolean, default: false },
    export: { type: Boolean, default: false },
    import: { type: Boolean, default: false },
    print: { type: Boolean, default: false },
    bulk: { type: Boolean, default: false }
  },
  fields: [String], // Field-level: list of restricted fields
  conditions: Schema.Types.Mixed // ABAC: e.g., { branch: 'own', amount: { max: 10000 } }
}, { _id: false });

const roleSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true },
  description: String,
  company: { type: Schema.Types.ObjectId, ref: 'Company' }, // null = global/super-admin role
  
  isSystem: { type: Boolean, default: false }, // System roles cannot be deleted
  isActive: { type: Boolean, default: true },
  
  permissions: [permissionSchema],
  
  // UI access
  allowedModules: [String], // Modules visible in sidebar
  
  // Data scope
  dataScope: {
    type: String,
    enum: ['all', 'own-company', 'own-branch', 'own-warehouse', 'own-records'],
    default: 'own-company'
  },
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

roleSchema.index({ slug: 1, company: 1 }, { unique: true });

// Static: get default roles
roleSchema.statics.getDefaultRoles = function () {
  return [
    'super_admin', 'company_owner', 'admin', 'manager',
    'accountant', 'sales_manager', 'sales_executive',
    'cashier', 'inventory_manager', 'warehouse_manager',
    'hr_manager', 'employee', 'customer', 'supplier'
  ];
};

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
