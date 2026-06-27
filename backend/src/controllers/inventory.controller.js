'use strict';

const Product = require('../models/Product');
const { Inventory, StockMovement, Batch, Serial } = require('../models/Inventory');
const { Category, Brand, Unit } = require('../models/Category');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { emitToCompany } = require('../socket');
const APIFeatures = require('../utils/apiFeatures');

// ─── Get All Products ──────────────────────────────────────────────────────────
exports.getProducts = asyncHandler(async (req, res, next) => {
  const query = Product.find({ 
    company: req.companyId,
    isDeleted: false
  })
    .populate('category', 'name')
    .populate('brand', 'name')
    .populate('unit', 'name shortName');
  
  const features = new APIFeatures(query, req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();
  
  const [products, total] = await Promise.all([
    features.query,
    Product.countDocuments({ company: req.companyId, isDeleted: false, ...req.queryFilter })
  ]);
  
  res.json({
    success: true,
    data: {
      products,
      total,
      page: features.page,
      pages: Math.ceil(total / features.limit),
      limit: features.limit
    }
  });
});

// ─── Get Product by ID ─────────────────────────────────────────────────────────
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findOne({
    _id: req.params.id,
    company: req.companyId,
    isDeleted: false
  })
    .populate('category brand unit purchaseUnit')
    .populate('defaultWarehouse', 'name')
    .populate('preferredSupplier', 'name phone');
  
  if (!product) {
    return next(new AppError('Product not found.', 404));
  }
  
  // Get stock per warehouse
  const inventories = await Inventory.find({
    company: req.companyId,
    product: product._id
  }).populate('warehouse', 'name code');
  
  res.json({
    success: true,
    data: { product, inventories }
  });
});

// ─── Create Product ────────────────────────────────────────────────────────────
exports.createProduct = asyncHandler(async (req, res, next) => {
  const { openingStock, openingWarehouse, ...productData } = req.body;
  
  // Auto-generate SKU if enabled
  if (!productData.sku) {
    productData.sku = await generateSku(req.companyId, productData.name);
  } else {
    // Check SKU uniqueness
    const existingSku = await Product.findOne({ company: req.companyId, sku: productData.sku });
    if (existingSku) {
      return next(new AppError(`SKU "${productData.sku}" already exists.`, 409));
    }
  }
  
  productData.company = req.companyId;
  productData.createdBy = req.user._id;
  productData.currentStock = openingStock || 0;
  productData.availableStock = openingStock || 0;
  
  const product = await Product.create(productData);
  
  // Record opening stock if provided
  if (openingStock && openingStock > 0 && openingWarehouse) {
    await recordStockMovement({
      company: req.companyId,
      warehouse: openingWarehouse,
      product: product._id,
      movementType: 'opening',
      quantity: openingStock,
      previousStock: 0,
      newStock: openingStock,
      costPrice: productData.purchasePrice || 0,
      totalValue: (openingStock * (productData.purchasePrice || 0)),
      referenceType: 'opening',
      notes: 'Opening stock entry',
      performedBy: req.user._id
    });
  }
  
  // Emit real-time
  emitToCompany(req.companyId, 'product:created', { product });
  
  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    data: { product }
  });
});

// ─── Update Product ────────────────────────────────────────────────────────────
exports.updateProduct = asyncHandler(async (req, res, next) => {
  const { sku, ...updateData } = req.body;
  
  if (sku) {
    const existingSku = await Product.findOne({
      company: req.companyId,
      sku,
      _id: { $ne: req.params.id }
    });
    if (existingSku) {
      return next(new AppError(`SKU "${sku}" already exists.`, 409));
    }
    updateData.sku = sku;
  }
  
  updateData.updatedBy = req.user._id;
  
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    updateData,
    { new: true, runValidators: true }
  );
  
  if (!product) {
    return next(new AppError('Product not found.', 404));
  }
  
  emitToCompany(req.companyId, 'product:updated', { product });
  
  res.json({
    success: true,
    message: 'Product updated successfully.',
    data: { product }
  });
});

// ─── Delete Product ────────────────────────────────────────────────────────────
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  // Check if product has stock
  const inventory = await Inventory.findOne({
    company: req.companyId,
    product: req.params.id,
    quantity: { $gt: 0 }
  });
  
  if (inventory) {
    return next(new AppError('Cannot delete product with existing stock. Please adjust stock to zero first.', 400));
  }
  
  await Product.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { isDeleted: true, updatedBy: req.user._id }
  );
  
  res.json({ success: true, message: 'Product deleted successfully.' });
});

// ─── Stock Adjustment ──────────────────────────────────────────────────────────
exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { productId, warehouseId, adjustmentType, quantity, reason, costPrice, notes } = req.body;
  
  if (!['adjustment_in', 'adjustment_out'].includes(adjustmentType)) {
    return next(new AppError('Invalid adjustment type.', 400));
  }
  
  if (quantity <= 0) {
    return next(new AppError('Quantity must be greater than zero.', 400));
  }
  
  // Get current inventory
  let inventory = await Inventory.findOne({
    company: req.companyId,
    warehouse: warehouseId,
    product: productId
  });
  
  const currentStock = inventory?.quantity || 0;
  
  if (adjustmentType === 'adjustment_out' && quantity > currentStock) {
    return next(new AppError(`Insufficient stock. Available: ${currentStock}`, 400));
  }
  
  const newStock = adjustmentType === 'adjustment_in'
    ? currentStock + quantity
    : currentStock - quantity;
  
  // Update or create inventory record
  inventory = await Inventory.findOneAndUpdate(
    { company: req.companyId, warehouse: warehouseId, product: productId },
    {
      $inc: { quantity: adjustmentType === 'adjustment_in' ? quantity : -quantity },
      $set: { lastUpdated: new Date() }
    },
    { upsert: true, new: true }
  );
  
  // Update product total stock
  await updateProductTotalStock(req.companyId, productId);
  
  // Record movement
  const movement = await recordStockMovement({
    company: req.companyId,
    warehouse: warehouseId,
    product: productId,
    movementType: adjustmentType,
    quantity,
    previousStock: currentStock,
    newStock,
    costPrice: costPrice || 0,
    totalValue: quantity * (costPrice || 0),
    notes: notes || reason,
    performedBy: req.user._id
  });
  
  emitToCompany(req.companyId, 'stock:adjusted', { productId, warehouseId, newStock });
  
  res.json({
    success: true,
    message: 'Stock adjusted successfully.',
    data: { inventory, movement }
  });
});

// ─── Stock Transfer ────────────────────────────────────────────────────────────
exports.transferStock = asyncHandler(async (req, res, next) => {
  const { productId, fromWarehouse, toWarehouse, quantity, notes } = req.body;
  
  if (fromWarehouse === toWarehouse) {
    return next(new AppError('Source and destination warehouses cannot be the same.', 400));
  }
  
  // Check source stock
  const sourceInventory = await Inventory.findOne({
    company: req.companyId,
    warehouse: fromWarehouse,
    product: productId
  });
  
  if (!sourceInventory || sourceInventory.quantity < quantity) {
    return next(new AppError(`Insufficient stock in source warehouse. Available: ${sourceInventory?.quantity || 0}`, 400));
  }
  
  const prevSourceStock = sourceInventory.quantity;
  const prevDestStock = (await Inventory.findOne({ company: req.companyId, warehouse: toWarehouse, product: productId }))?.quantity || 0;
  
  // Execute transfer (use MongoDB session for atomicity)
  const session = await require('mongoose').startSession();
  session.startTransaction();
  
  try {
    // Deduct from source
    await Inventory.findOneAndUpdate(
      { company: req.companyId, warehouse: fromWarehouse, product: productId },
      { $inc: { quantity: -quantity }, lastUpdated: new Date() },
      { session }
    );
    
    // Add to destination
    await Inventory.findOneAndUpdate(
      { company: req.companyId, warehouse: toWarehouse, product: productId },
      { $inc: { quantity: quantity }, lastUpdated: new Date(), company: req.companyId, warehouse: toWarehouse, product: productId },
      { upsert: true, new: true, session }
    );
    
    // Record outgoing movement
    await StockMovement.create([{
      company: req.companyId,
      warehouse: fromWarehouse,
      product: productId,
      movementType: 'transfer_out',
      quantity,
      previousStock: prevSourceStock,
      newStock: prevSourceStock - quantity,
      fromWarehouse,
      toWarehouse,
      notes,
      performedBy: req.user._id
    }], { session });
    
    // Record incoming movement
    await StockMovement.create([{
      company: req.companyId,
      warehouse: toWarehouse,
      product: productId,
      movementType: 'transfer_in',
      quantity,
      previousStock: prevDestStock,
      newStock: prevDestStock + quantity,
      fromWarehouse,
      toWarehouse,
      notes,
      performedBy: req.user._id
    }], { session });
    
    await session.commitTransaction();
    session.endSession();
    
    await updateProductTotalStock(req.companyId, productId);
    
    emitToCompany(req.companyId, 'stock:transferred', { productId, fromWarehouse, toWarehouse, quantity });
    
    res.json({ success: true, message: 'Stock transferred successfully.' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// ─── Get Stock Movements ───────────────────────────────────────────────────────
exports.getStockMovements = asyncHandler(async (req, res, next) => {
  const { productId, warehouseId, type, from, to, page = 1, limit = 50 } = req.query;
  
  const filter = { company: req.companyId };
  if (productId) filter.product = productId;
  if (warehouseId) filter.warehouse = warehouseId;
  if (type) filter.movementType = type;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  
  const skip = (page - 1) * limit;
  
  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .populate('product', 'name sku')
      .populate('warehouse', 'name')
      .populate('performedBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    StockMovement.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: {
      movements,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  });
});

// ─── Get Low Stock Products ────────────────────────────────────────────────────
exports.getLowStockProducts = asyncHandler(async (req, res, next) => {
  const products = await Product.find({
    company: req.companyId,
    isActive: true,
    isDeleted: false,
    trackInventory: true,
    $expr: { $lte: ['$currentStock', '$reorderLevel'] }
  })
    .populate('category', 'name')
    .populate('unit', 'shortName')
    .select('name sku currentStock reorderLevel reorderQty category unit')
    .sort({ currentStock: 1 });
  
  res.json({
    success: true,
    data: { products, total: products.length }
  });
});

// ─── Barcode Search ────────────────────────────────────────────────────────────
exports.searchByBarcode = asyncHandler(async (req, res, next) => {
  const { barcode } = req.params;
  
  const product = await Product.findOne({
    company: req.companyId,
    $or: [{ barcode }, { sku: barcode }],
    isActive: true,
    isDeleted: false
  })
    .populate('unit', 'name shortName')
    .populate('category', 'name');
  
  if (!product) {
    // Search in variants
    const variantProduct = await Product.findOne({
      company: req.companyId,
      'variants.barcode': barcode,
      isActive: true,
      isDeleted: false
    });
    
    if (variantProduct) {
      const variant = variantProduct.variants.find(v => v.barcode === barcode);
      return res.json({
        success: true,
        data: { product: variantProduct, variant, type: 'variant' }
      });
    }
    
    return next(new AppError(`No product found with barcode: ${barcode}`, 404));
  }
  
  res.json({ success: true, data: { product, type: 'simple' } });
});

// ─── ABC Analysis ──────────────────────────────────────────────────────────────
exports.abcAnalysis = asyncHandler(async (req, res, next) => {
  const { months = 3 } = req.query;
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - months);
  
  const analysis = await StockMovement.aggregate([
    {
      $match: {
        company: require('mongoose').Types.ObjectId(req.companyId),
        movementType: { $in: ['sale', 'pos_sale'] },
        createdAt: { $gte: fromDate }
      }
    },
    {
      $group: {
        _id: '$product',
        totalQty: { $sum: '$quantity' },
        totalValue: { $sum: '$totalValue' }
      }
    },
    { $sort: { totalValue: -1 } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $project: {
        name: '$product.name',
        sku: '$product.sku',
        totalQty: 1,
        totalValue: 1
      }
    }
  ]);
  
  // Classify A/B/C
  const totalValue = analysis.reduce((sum, p) => sum + p.totalValue, 0);
  let cumulative = 0;
  
  const result = analysis.map(p => {
    cumulative += p.totalValue;
    const cumulativePercent = (cumulative / totalValue) * 100;
    return {
      ...p,
      category: cumulativePercent <= 70 ? 'A' : cumulativePercent <= 90 ? 'B' : 'C'
    };
  });
  
  res.json({ success: true, data: { analysis: result, totalValue } });
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function generateSku(companyId, name) {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const count = await Product.countDocuments({ company: companyId });
  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
}

async function recordStockMovement(data) {
  const movement = await StockMovement.create(data);
  
  // Update inventory
  await Inventory.findOneAndUpdate(
    { company: data.company, warehouse: data.warehouse, product: data.product },
    {
      $set: { quantity: data.newStock, lastUpdated: new Date(), lastMovement: movement._id }
    },
    { upsert: true }
  );
  
  return movement;
}

async function updateProductTotalStock(companyId, productId) {
  const result = await Inventory.aggregate([
    { $match: { company: require('mongoose').Types.ObjectId(companyId), product: require('mongoose').Types.ObjectId(productId) } },
    { $group: { _id: null, total: { $sum: '$quantity' }, reserved: { $sum: '$reservedQty' } } }
  ]);
  
  const total = result[0]?.total || 0;
  const reserved = result[0]?.reserved || 0;
  
  await Product.findByIdAndUpdate(productId, {
    currentStock: total,
    reservedStock: reserved,
    availableStock: total - reserved
  });
}

module.exports.recordStockMovement = recordStockMovement;
module.exports.updateProductTotalStock = updateProductTotalStock;
