'use strict';

const logger = require('../config/logger');

/**
 * ENTERPRISE GLOBAL SEARCH ENGINE
 * Searches across all entities simultaneously and returns ranked results.
 */
exports.globalSearch = async (companyId, query, options = {}) => {
  const { limit = 5, categories } = options;
  if (!query || query.trim().length < 2) return { results: [], total: 0 };

  const q = query.trim();
  const searchAll = !categories || categories.length === 0;

  const searches = [];

  if (searchAll || categories.includes('products')) {
    searches.push(exports.searchProducts(companyId, q, limit));
  }
  if (searchAll || categories.includes('customers')) {
    searches.push(exports.searchCustomers(companyId, q, limit));
  }
  if (searchAll || categories.includes('suppliers')) {
    searches.push(exports.searchSuppliers(companyId, q, limit));
  }
  if (searchAll || categories.includes('invoices')) {
    searches.push(exports.searchInvoices(companyId, q, limit));
  }
  if (searchAll || categories.includes('purchase_orders')) {
    searches.push(exports.searchPurchaseOrders(companyId, q, limit));
  }
  if (searchAll || categories.includes('employees')) {
    searches.push(exports.searchEmployees(companyId, q, limit));
  }
  if (searchAll || categories.includes('serials')) {
    searches.push(exports.searchSerials(companyId, q, limit));
  }

  const resultSets = await Promise.allSettled(searches);

  const results = [];
  let total = 0;
  for (const set of resultSets) {
    if (set.status === 'fulfilled' && set.value) {
      results.push(...set.value.items);
      total += set.value.count;
    }
  }

  // Sort by relevance score
  results.sort((a, b) => (b.score || 0) - (a.score || 0));

  return { results: results.slice(0, limit * 3), total, query: q };
};

exports.searchProducts = async (companyId, q, limit) => {
  try {
    const Product = require('../models/Product');
    const isBarcode = /^[0-9]{8,14}$/.test(q);
    const filter = { company: companyId, isActive: true, isDeleted: false };

    if (isBarcode) {
      filter.$or = [{ barcode: q }, { sku: q }];
    } else {
      filter.$text = { $search: q };
    }

    const items = await Product.find(filter, isBarcode ? {} : { score: { $meta: 'textScore' } })
      .sort(isBarcode ? {} : { score: { $meta: 'textScore' } })
      .select('name sku barcode currentStock sellingPrice primaryImage category')
      .populate('category', 'name')
      .limit(limit)
      .lean();

    return {
      category: 'products',
      count: items.length,
      items: items.map(p => ({
        type: 'product',
        id: p._id,
        title: p.name,
        subtitle: `SKU: ${p.sku || '—'} | Stock: ${p.currentStock} | ₹${p.sellingPrice}`,
        image: p.primaryImage,
        url: `/inventory/products/${p._id}`,
        score: p.score || (isBarcode ? 100 : 50),
        data: p
      }))
    };
  } catch (err) {
    logger.error('Search products error:', err.message);
    return { category: 'products', count: 0, items: [] };
  }
};

exports.searchCustomers = async (companyId, q, limit) => {
  try {
    const Customer = require('../models/Customer');
    const items = await Customer.find({
      company: companyId,
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { gstNumber: { $regex: q, $options: 'i' } }
      ]
    }).select('name phone email balance gstNumber').limit(limit).lean();

    return {
      category: 'customers',
      count: items.length,
      items: items.map(c => ({
        type: 'customer',
        id: c._id,
        title: c.name,
        subtitle: `${c.phone || c.email || '—'} | Balance: ₹${c.balance || 0}`,
        url: `/sales/customers/${c._id}`,
        score: 70,
        data: c
      }))
    };
  } catch (err) {
    return { category: 'customers', count: 0, items: [] };
  }
};

exports.searchSuppliers = async (companyId, q, limit) => {
  try {
    const Supplier = require('../models/Supplier');
    const items = await Supplier.find({
      company: companyId,
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { gstNumber: { $regex: q, $options: 'i' } }
      ]
    }).select('name phone email gstNumber').limit(limit).lean();

    return {
      category: 'suppliers',
      count: items.length,
      items: items.map(s => ({
        type: 'supplier',
        id: s._id,
        title: s.name,
        subtitle: s.phone || s.email || '—',
        url: `/purchase/suppliers/${s._id}`,
        score: 65,
        data: s
      }))
    };
  } catch (err) {
    return { category: 'suppliers', count: 0, items: [] };
  }
};

exports.searchInvoices = async (companyId, q, limit) => {
  try {
    const Invoice = require('../models/Invoice');
    const items = await Invoice.find({
      company: companyId,
      $or: [
        { invoiceNumber: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } }
      ]
    }).select('invoiceNumber customerName grandTotal paymentStatus createdAt').limit(limit).lean();

    return {
      category: 'invoices',
      count: items.length,
      items: items.map(inv => ({
        type: 'invoice',
        id: inv._id,
        title: inv.invoiceNumber,
        subtitle: `${inv.customerName} | ₹${inv.grandTotal} | ${inv.paymentStatus}`,
        url: `/sales/invoices/${inv._id}`,
        score: 80,
        data: inv
      }))
    };
  } catch (err) {
    return { category: 'invoices', count: 0, items: [] };
  }
};

exports.searchPurchaseOrders = async (companyId, q, limit) => {
  try {
    const PurchaseOrder = require('../models/PurchaseOrder');
    const items = await PurchaseOrder.find({
      company: companyId,
      $or: [
        { poNumber: { $regex: q, $options: 'i' } },
        { supplierName: { $regex: q, $options: 'i' } }
      ]
    }).select('poNumber supplierName grandTotal status').limit(limit).lean();

    return {
      category: 'purchase_orders',
      count: items.length,
      items: items.map(po => ({
        type: 'purchase_order',
        id: po._id,
        title: po.poNumber,
        subtitle: `${po.supplierName || '—'} | ₹${po.grandTotal} | ${po.status}`,
        url: `/purchase/orders/${po._id}`,
        score: 75,
        data: po
      }))
    };
  } catch (err) {
    return { category: 'purchase_orders', count: 0, items: [] };
  }
};

exports.searchEmployees = async (companyId, q, limit) => {
  try {
    const { Employee } = require('../models/Employee');
    const items = await Employee.find({
      company: companyId,
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { employeeId: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ]
    }).select('name employeeId designation department phone').limit(limit).lean();

    return {
      category: 'employees',
      count: items.length,
      items: items.map(e => ({
        type: 'employee',
        id: e._id,
        title: e.name,
        subtitle: `${e.employeeId} | ${e.designation || '—'} | ${e.department || '—'}`,
        url: `/hrms/employees/${e._id}`,
        score: 60,
        data: e
      }))
    };
  } catch (err) {
    return { category: 'employees', count: 0, items: [] };
  }
};

exports.searchSerials = async (companyId, q, limit) => {
  try {
    const { Serial } = require('../models/Inventory');
    const items = await Serial.find({
      company: companyId,
      $or: [
        { serialNumber: { $regex: q, $options: 'i' } },
        { imei1: { $regex: q, $options: 'i' } },
        { imei2: { $regex: q, $options: 'i' } }
      ]
    }).select('serialNumber imei1 imei2 status product').populate('product', 'name').limit(limit).lean();

    return {
      category: 'serials',
      count: items.length,
      items: items.map(s => ({
        type: 'serial',
        id: s._id,
        title: s.serialNumber,
        subtitle: `${s.product?.name || '—'} | IMEI: ${s.imei1 || '—'} | ${s.status}`,
        url: `/inventory/serials/${s._id}`,
        score: 90, // high score since serial/IMEI search is very specific
        data: s
      }))
    };
  } catch (err) {
    return { category: 'serials', count: 0, items: [] };
  }
};
