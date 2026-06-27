'use strict';

const logger = require('../config/logger');

/**
 * INVENTRA SMART BARCODE ENGINE
 * Scan any barcode/SKU/IMEI → Returns a complete Product Intelligence Card.
 * Covers: Stock, Location, Supplier, Sales History, Profitability, Expiry, Serial Info.
 */

exports.scanProduct = async (code, companyId) => {
  const Product = require('../models/Product');
  const { Inventory, StockMovement, Batch, Serial } = require('../models/Inventory');

  if (!code || !code.trim()) throw new Error('Scan code is required');
  const q = code.trim();

  // ─── 1. Find Product by barcode / SKU / IMEI / serial number ─────────────
  let product = await Product.findOne({
    company: companyId,
    isDeleted: false,
    $or: [
      { barcode: q },
      { sku: q },
      { upc: q },
      { ean: q },
      { isbn: q }
    ]
  })
  .populate('category', 'name')
  .populate('preferredSupplier', 'name phone gstNumber')
  .lean();

  // Fallback: search by serial/IMEI
  let serialRecord = null;
  if (!product) {
    serialRecord = await Serial.findOne({
      company: companyId,
      $or: [{ serialNumber: q }, { imei1: q }, { imei2: q }]
    }).populate('product').lean();

    if (serialRecord?.product) {
      product = await Product.findById(serialRecord.product._id || serialRecord.product)
        .populate('category', 'name')
        .populate('preferredSupplier', 'name phone gstNumber')
        .lean();
    }
  }

  if (!product) {
    return { found: false, code: q, message: 'Product not found for this code.' };
  }

  // ─── 2. Inventory Status across all warehouses ────────────────────────────
  const inventoryData = await Inventory.find({ company: companyId, product: product._id })
    .populate('warehouse', 'name city')
    .populate('zone', 'name code')
    .populate('rack', 'name code')
    .populate('shelf', 'name code')
    .populate('bin', 'name code')
    .lean();

  const totalStock = inventoryData.reduce((s, i) => s + (i.quantity || 0), 0);
  const reservedStock = inventoryData.reduce((s, i) => s + (i.reservedQuantity || 0), 0);
  const availableStock = inventoryData.reduce((s, i) => s + (i.availableQuantity || (i.quantity - (i.reservedQuantity || 0))), 0);

  const locations = inventoryData.map(inv => ({
    warehouse: inv.warehouse?.name,
    city: inv.warehouse?.city,
    zone: inv.zone?.name,
    rack: inv.rack?.name,
    shelf: inv.shelf?.name,
    bin: inv.bin?.name,
    quantity: inv.quantity,
    reservedQuantity: inv.reservedQuantity || 0,
    reorderLevel: inv.reorderLevel,
    isLowStock: inv.quantity <= (inv.reorderLevel || 0)
  }));

  // ─── 3. Batch/Expiry Info ─────────────────────────────────────────────────
  const batches = await Batch.find({ company: companyId, product: product._id, quantity: { $gt: 0 } })
    .sort({ expiryDate: 1 })
    .lean();

  const soonestExpiry = batches.find(b => b.expiryDate)?.expiryDate || null;
  const expiredBatches = batches.filter(b => b.expiryDate && new Date(b.expiryDate) < new Date()).length;
  const nearExpiryBatches = batches.filter(b => {
    if (!b.expiryDate) return false;
    const days = Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000);
    return days > 0 && days <= 30;
  }).length;

  // ─── 4. Sales History (Last 90 Days) ─────────────────────────────────────
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const salesHistory = await StockMovement.aggregate([
    {
      $match: {
        company: companyId,
        product: product._id,
        movementType: { $in: ['sale', 'pos_sale'] },
        createdAt: { $gte: ninetyDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        totalQty: { $sum: '$quantity' },
        totalValue: { $sum: '$totalValue' }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 3 }
  ]);

  const totalSold90d = salesHistory.reduce((s, m) => s + m.totalQty, 0);
  const totalRevenue90d = salesHistory.reduce((s, m) => s + m.totalValue, 0);
  const avgDailySales = totalSold90d / 90;
  const daysOfStock = avgDailySales > 0 ? Math.round(availableStock / avgDailySales) : null;

  // ─── 5. Purchase History ───────────────────────────────────────────────────
  const purchaseHistory = await StockMovement.find({
    company: companyId,
    product: product._id,
    movementType: 'purchase'
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('quantity totalValue createdAt reference')
    .lean();

  // ─── 6. Profitability ──────────────────────────────────────────────────────
  const purchasePrice = product.purchasePrice || 0;
  const sellingPrice = product.sellingPrice || 0;
  const margin = sellingPrice > 0 ? ((sellingPrice - purchasePrice) / sellingPrice * 100) : 0;
  const grossProfit = (sellingPrice - purchasePrice) * totalSold90d;

  // ─── 7. Serialized Product Info ────────────────────────────────────────────
  let serialInfo = null;
  if (serialRecord) {
    const Warranty = require('../models/Warranty');
    const warranty = await Warranty.findOne({
      company: companyId,
      serial: serialRecord._id
    }).lean();

    serialInfo = {
      serialNumber: serialRecord.serialNumber,
      imei1: serialRecord.imei1,
      imei2: serialRecord.imei2,
      status: serialRecord.status,
      soldDate: serialRecord.soldDate,
      warranty: warranty ? {
        expiryDate: warranty.expiryDate,
        isExpired: warranty.isExpired,
        status: warranty.status,
        vendor: warranty.warrantyVendor
      } : null
    };
  }

  // ─── 8. Assembly: Product Intelligence Card ────────────────────────────────
  return {
    found: true,
    scannedCode: q,
    product: {
      id: product._id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category?.name,
      brand: product.brand,
      description: product.description,
      images: product.images || [],
      primaryImage: product.primaryImage,
      unit: product.unit,
      hsn: product.hsn,
      taxRate: product.taxRate
    },
    pricing: {
      purchasePrice,
      sellingPrice,
      mrp: product.mrp,
      wholesalePrice: product.wholesalePrice,
      marginPercent: parseFloat(margin.toFixed(2)),
      grossProfit90d: parseFloat(grossProfit.toFixed(2))
    },
    inventory: {
      totalStock,
      reservedStock,
      availableStock,
      locations,
      reorderLevel: product.reorderLevel,
      isLowStock: totalStock <= (product.reorderLevel || 0),
      isOutOfStock: totalStock <= 0
    },
    batches: {
      total: batches.length,
      soonestExpiry,
      expiredBatches,
      nearExpiryBatches,
      batches: batches.slice(0, 5).map(b => ({
        batchNumber: b.batchNumber,
        quantity: b.quantity,
        expiryDate: b.expiryDate,
        manufacturingDate: b.manufacturingDate
      }))
    },
    sales: {
      last90Days: {
        quantitySold: totalSold90d,
        revenue: parseFloat(totalRevenue90d.toFixed(2)),
        avgDailySales: parseFloat(avgDailySales.toFixed(2)),
        daysOfStockRemaining: daysOfStock
      },
      history: salesHistory
    },
    purchases: {
      lastPurchaseDate: purchaseHistory[0]?.createdAt,
      lastPurchasePrice: purchaseHistory[0]?.totalValue,
      history: purchaseHistory
    },
    supplier: product.preferredSupplier ? {
      id: product.preferredSupplier._id,
      name: product.preferredSupplier.name,
      phone: product.preferredSupplier.phone,
      gstNumber: product.preferredSupplier.gstNumber
    } : null,
    serialInfo,
    generatedAt: new Date()
  };
};
