'use strict';

// ─── product.routes.js ─────────────────────────────────────────────────────────
const productRouter = require('express').Router();
const productCtrl = require('../controllers/inventory.controller');
const { authenticate, hasPermission } = require('../middleware/auth');

productRouter.use(authenticate);

productRouter.route('/')
  .get(hasPermission('inventory', 'read'), productCtrl.getProducts)
  .post(hasPermission('inventory', 'create'), productCtrl.createProduct);

productRouter.route('/:id')
  .get(hasPermission('inventory', 'read'), productCtrl.getProduct)
  .put(hasPermission('inventory', 'update'), productCtrl.updateProduct)
  .delete(hasPermission('inventory', 'delete'), productCtrl.deleteProduct);

productRouter.get('/search/barcode/:barcode', hasPermission('inventory', 'read'), productCtrl.searchByBarcode);

module.exports = productRouter;
