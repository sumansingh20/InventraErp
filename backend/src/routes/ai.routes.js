'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiCopilot = require('../services/ai-copilot.service');
const fraudDetection = require('../services/fraud-detection.service');
const FraudAlert = require('../models/FraudAlert');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// ─── AI Business Copilot ──────────────────────────────────────────────────────
// POST /api/v1/ai/query  { query: "Which product sells most?" }
router.post('/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: 'Query is required' });

    const result = await aiCopilot.answerQuery(query, req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Voice command — convert voice text to an action
// POST /api/v1/ai/voice-command  { text: "create invoice" }
router.post('/voice-command', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Voice text required' });

    const t = text.toLowerCase();

    // Map voice commands to system actions
    const commands = [
      { patterns: ['create invoice', 'new invoice', 'make bill'], action: 'navigate', target: '/sales/invoices', params: { action: 'new' } },
      { patterns: ['open pos', 'start billing', 'point of sale'], action: 'navigate', target: '/pos/terminal' },
      { patterns: ['show stock', 'check inventory', 'stock level'], action: 'navigate', target: '/inventory/stock' },
      { patterns: ['create purchase order', 'new po', 'buy stock'], action: 'navigate', target: '/purchase/orders', params: { action: 'new' } },
      { patterns: ['find product', 'search product', 'look for'], action: 'search', category: 'products', query: text.replace(/find product|search product|look for/gi, '').trim() },
      { patterns: ['add customer', 'new customer', 'create customer'], action: 'navigate', target: '/sales/customers', params: { action: 'new' } },
      { patterns: ['show dashboard', 'home', 'go back'], action: 'navigate', target: '/dashboard' },
      { patterns: ['low stock', 'reorder alert'], action: 'navigate', target: '/inventory/stock', params: { filter: 'low_stock' } },
      { patterns: ['unpaid invoice', 'overdue', 'pending payment'], action: 'navigate', target: '/sales/invoices', params: { filter: 'overdue' } }
    ];

    let matched = null;
    for (const cmd of commands) {
      if (cmd.patterns.some(p => t.includes(p))) {
        matched = cmd;
        break;
      }
    }

    if (matched) {
      res.json({ success: true, data: { recognized: true, command: matched, originalText: text } });
    } else {
      // Fall back to AI query
      const aiResult = await aiCopilot.answerQuery(text, req.user.company);
      res.json({ success: true, data: { recognized: false, aiResponse: aiResult, originalText: text } });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Fraud Detection ─────────────────────────────────────────────────────────

// Run fraud scan
router.post('/fraud-scan', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const alerts = await fraudDetection.runFraudScan(req.user.company);
    res.json({ success: true, data: alerts, message: `${alerts.length} fraud alerts generated` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List fraud alerts
router.get('/fraud-alerts', async (req, res) => {
  try {
    const { status, severity, limit = 50, page = 1 } = req.query;
    const filter = { company: req.user.company };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter)
        .sort({ detectedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('suspectedUser', 'name email'),
      FraudAlert.countDocuments(filter)
    ]);

    res.json({ success: true, data: alerts, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update fraud alert status
router.patch('/fraud-alerts/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body;
    const alert = await FraudAlert.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status, resolutionNotes, reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
