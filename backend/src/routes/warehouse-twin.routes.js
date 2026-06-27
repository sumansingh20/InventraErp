'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const warehouseTwinService = require('../services/warehouse-twin.service');

router.use(authenticate);

// GET /api/v1/warehouse-twin/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await warehouseTwinService.getWarehouseTwin(req.params.id, req.user.company);
    res.json({ success: true, data: result.zones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/warehouse-twin/:id/heatmap
router.get('/:id/heatmap', async (req, res) => {
  try {
    const result = await warehouseTwinService.getHeatmap(req.params.id, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/warehouse-twin/picking-route
router.post('/picking-route', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Order ID is required' });
    const result = await warehouseTwinService.getPickingRoute(orderId, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
