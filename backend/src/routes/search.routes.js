'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const searchService = require('../services/search.service');

router.use(authenticate);

// ─── Global Search ────────────────────────────────────────────────────────────
// GET /api/v1/search?q=laptop&limit=10&categories=products,customers
router.get('/', async (req, res) => {
  try {
    const { q, limit = 10, categories } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, results: [], total: 0, query: q });
    }

    const categoryList = categories ? categories.split(',').map(c => c.trim()) : [];
    const result = await searchService.globalSearch(
      req.user.company,
      q.trim(),
      { limit: parseInt(limit), categories: categoryList }
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Category-specific searches ──────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const result = await searchService.searchProducts(req.user.company, req.query.q, parseInt(req.query.limit) || 20);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/serials', async (req, res) => {
  try {
    const result = await searchService.searchSerials(req.user.company, req.query.q, parseInt(req.query.limit) || 20);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
