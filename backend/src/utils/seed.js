'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = require('../config/database');
const User = require('../models/User');
const Role = require('../models/Role');
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const Warehouse = require('../models/Warehouse');
const { Category, Brand, Unit } = require('../models/Category');

async function seedData() {
  try {
    await connectDB();
    console.log('Connected to MongoDB. Starting database seeding...');

    // Clear existing base collections
    await Promise.all([
      User.deleteMany({}),
      Role.deleteMany({}),
      Company.deleteMany({}),
      Branch.deleteMany({}),
      Warehouse.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Unit.deleteMany({})
    ]);
    console.log('Cleared existing collections.');

    // 1. Create default Company
    const company = await Company.create({
      name: 'Inventra Headquarters',
      legalName: 'Inventra Enterprise Solutions Ltd',
      slug: 'inventra-headquarters',
      email: 'corp@inventra.com',
      phone: '1800-123-4567',
      address: {
        line1: '101 Cyber Towers',
        line2: 'Hitec City',
        city: 'Hyderabad',
        state: 'Telangana',
        stateCode: '36',
        pincode: '500081',
        country: 'India'
      },
      gst: {
        gstin: '36AAAAA1111A1Z1',
        gstRegistrationType: 'regular',
        gstState: 'Telangana',
        gstStateCode: '36'
      },
      isActive: true,
      isVerified: true
    });
    console.log(`Default Company created: ${company.name}`);

    // 2. Create default Branch
    const branch = await Branch.create({
      company: company._id,
      name: 'Main HQ Branch',
      code: 'HQ01',
      email: 'hq@inventra.com',
      phone: '040-12345678',
      address: {
        line1: '101 Cyber Towers',
        city: 'Hyderabad',
        state: 'Telangana',
        stateCode: '36',
        pincode: '500081'
      },
      isHeadOffice: true,
      isActive: true
    });
    console.log(`Default Branch created: ${branch.name}`);

    // 3. Create default Warehouse
    const warehouse = await Warehouse.create({
      company: company._id,
      branch: branch._id,
      name: 'HQ Warehouse',
      code: 'WH01',
      description: 'Primary corporate warehouse',
      warehouseType: 'main',
      isDefault: true,
      isActive: true
    });
    console.log(`Default Warehouse created: ${warehouse.name}`);

    // Update branch with warehouse reference
    branch.defaultWarehouse = warehouse._id;
    await branch.save();

    // 4. Create default Roles
    const systemRoles = [
      {
        name: 'Super Admin',
        slug: 'super_admin',
        description: 'Full system authorization control',
        isSystem: true,
        allowedModules: ['dashboard', 'inventory', 'pos', 'sales', 'purchase', 'accounting', 'gst', 'crm', 'hrms', 'manufacturing', 'warehouse', 'reports', 'admin']
      },
      {
        name: 'Store Manager',
        slug: 'manager',
        description: 'Branch store management and inventory allocations',
        isSystem: true,
        company: company._id,
        allowedModules: ['dashboard', 'inventory', 'pos', 'sales', 'purchase', 'warehouse', 'reports']
      },
      {
        name: 'Cashier',
        slug: 'cashier',
        description: 'Point of sale operations and retail billing',
        isSystem: true,
        company: company._id,
        allowedModules: ['dashboard', 'pos']
      }
    ];

    const roles = await Role.create(systemRoles);
    console.log(`Default Roles seeded: ${roles.length}`);

    // 5. Create default Admin User
    const adminPassword = 'Admin@123';
    const superAdminRole = roles.find(r => r.slug === 'super_admin');
    
    const admin = await User.create({
      name: 'Suman Singh',
      email: 'admin@inventra.com',
      phone: '9876543210',
      password: adminPassword,
      role: superAdminRole._id,
      isSuperAdmin: true,
      company: company._id,
      branch: branch._id,
      warehouses: [warehouse._id],
      isActive: true,
      isEmailVerified: true
    });
    console.log(`SuperAdmin user created: ${admin.email} | Password: ${adminPassword}`);

    // Link company owner
    company.owner = admin._id;
    await company.save();

    // 6. Seed default Category, Brand, Unit
    const cat = await Category.create({
      company: company._id,
      name: 'General',
      slug: 'general',
      isActive: true,
      createdBy: admin._id
    });
    
    const brand = await Brand.create({
      company: company._id,
      name: 'General',
      isActive: true,
      createdBy: admin._id
    });
    
    const unit = await Unit.create({
      company: company._id,
      name: 'Pieces',
      shortName: 'pcs',
      unitType: 'quantity',
      isBase: true,
      isActive: true,
      createdBy: admin._id
    });
    
    console.log('Default Category, Brand, and Unit created.');
    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedData();
