'use strict';

const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');
const { authenticate, hasPermission } = require('../middleware/auth');

router.use(authenticate);

// Products
router.route('/products')
  .get(hasPermission('inventory', 'read'), inventoryController.getProducts)
  .post(hasPermission('inventory', 'create'), inventoryController.createProduct);

router.route('/products/:id')
  .get(hasPermission('inventory', 'read'), inventoryController.getProduct)
  .put(hasPermission('inventory', 'update'), inventoryController.updateProduct)
  .delete(hasPermission('inventory', 'delete'), inventoryController.deleteProduct);

// Barcode
router.get('/products/barcode/:barcode', hasPermission('inventory', 'read'), inventoryController.searchByBarcode);

// Stock operations
router.get('/movements', hasPermission('inventory', 'read'), inventoryController.getStockMovements);
router.post('/adjust', hasPermission('inventory', 'update'), inventoryController.adjustStock);
router.post('/transfer', hasPermission('inventory', 'update'), inventoryController.transferStock);

// Alerts & Analysis
router.get('/low-stock', hasPermission('inventory', 'read'), inventoryController.getLowStockProducts);
router.get('/abc-analysis', hasPermission('inventory', 'read'), inventoryController.abcAnalysis);

module.exports = router;
