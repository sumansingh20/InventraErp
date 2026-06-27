'use strict';

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { authenticate, hasPermission } = require('../middleware/auth');

router.use(authenticate);

router.route('/')
  .get(hasPermission('sales', 'read'), invoiceController.getInvoices)
  .post(hasPermission('sales', 'create'), invoiceController.createInvoice);

router.get('/pos/quick-bill', authenticate, invoiceController.posQuickBill);
router.post('/pos/quick-bill', authenticate, invoiceController.posQuickBill);

router.route('/:id')
  .get(hasPermission('sales', 'read'), invoiceController.getInvoice);

router.get('/:id/pdf', hasPermission('sales', 'print'), invoiceController.downloadPdf);
router.post('/:id/cancel', hasPermission('sales', 'update'), invoiceController.cancelInvoice);

router.post('/payment', hasPermission('sales', 'create'), invoiceController.recordPayment);
router.post('/return', hasPermission('sales', 'create'), invoiceController.createSalesReturn);

module.exports = router;
