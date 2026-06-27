'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const barcodeService = require('../services/barcode.service');
const knowledgeGraph = require('../services/knowledge-graph.service');

router.use(authenticate);

// ─── Full Barcode Intelligence Scan ───────────────────────────────────────────
// GET /api/v1/barcode/scan?code=<barcode>
// POST /api/v1/barcode/scan  { code: "..." }
router.get('/scan', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ success: false, message: 'Scan code is required' });
    const result = await barcodeService.scanProduct(code, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scan', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Scan code is required' });
    const result = await barcodeService.scanProduct(code, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/barcode/:code — direct URL lookup
router.get('/:code', async (req, res) => {
  try {
    const result = await barcodeService.scanProduct(req.params.code, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Product 360° Knowledge Graph ─────────────────────────────────────────────
// GET /api/v1/barcode/product360/:productId
router.get('/product360/:productId', async (req, res) => {
  try {
    const result = await knowledgeGraph.getProduct360(req.params.productId, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Customer 360° ────────────────────────────────────────────────────────────
router.get('/customer360/:customerId', async (req, res) => {
  try {
    const result = await knowledgeGraph.getCustomer360(req.params.customerId, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Supplier Reliability Score ────────────────────────────────────────────────
router.get('/supplier-score/:supplierId', async (req, res) => {
  try {
    const result = await knowledgeGraph.getSupplierScore(req.params.supplierId, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
