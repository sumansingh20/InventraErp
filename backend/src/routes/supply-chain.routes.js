'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supplyChainService = require('../services/supply-chain.service');

router.use(authenticate);

// Full supply chain lifecycle for a product
// GET /api/v1/supply-chain/product/:productId
router.get('/product/:productId', async (req, res) => {
  try {
    const result = await supplyChainService.trackProductLifecycle(req.params.productId, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Supply chain health overview
// GET /api/v1/supply-chain/health
router.get('/health', async (req, res) => {
  try {
    const result = await supplyChainService.getSupplyChainHealth(req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
