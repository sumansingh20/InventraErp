'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const automationService = require('../services/automation.service');
const WorkflowRule = require('../models/WorkflowRule');
const AutomationLog = require('../models/AutomationLog');
const BusinessInsight = require('../models/BusinessInsight');

// All routes require authentication
router.use(authenticate);

// ─── Workflow Rules CRUD ─────────────────────────────────────────────────────

// List all rules
router.get('/rules', async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const filter = { company: req.user.company };
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const rules = await WorkflowRule.find(filter)
      .sort({ priority: 1, createdAt: -1 })
      .populate('createdBy', 'name');

    res.json({ success: true, data: rules, total: rules.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create rule
router.post('/rules', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const rule = await WorkflowRule.create({
      ...req.body,
      company: req.user.company,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: rule, message: 'Workflow rule created' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get single rule
router.get('/rules/:id', async (req, res) => {
  try {
    const rule = await WorkflowRule.findOne({ _id: req.params.id, company: req.user.company });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update rule
router.put('/rules/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const rule = await WorkflowRule.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.json({ success: true, data: rule, message: 'Rule updated' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle rule active/inactive
router.patch('/rules/:id/toggle', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const rule = await WorkflowRule.findOne({ _id: req.params.id, company: req.user.company });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json({ success: true, data: rule, message: `Rule ${rule.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete rule
router.delete('/rules/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    await WorkflowRule.deleteOne({ _id: req.params.id, company: req.user.company });
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Manual Automation Triggers ──────────────────────────────────────────────

// Run full automation cycle
router.post('/run', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const result = await automationService.runAutomationCycle(req.user.company);
    res.json({ success: true, data: result, message: 'Automation cycle completed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-create purchase orders for low stock
router.post('/auto-po', requireRole(['admin', 'company_owner', 'purchase_manager']), async (req, res) => {
  try {
    const result = await automationService.autoCreatePurchaseOrders(req.user.company, req.body);
    res.json({ success: true, data: result, message: `${result.created} Purchase Orders created` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate sales forecast
router.get('/forecast/sales', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await automationService.generateSalesForecast(req.user.company, days);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate cash flow forecast
router.get('/forecast/cash-flow', async (req, res) => {
  try {
    const result = await automationService.generateCashFlowForecast(req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Rank suppliers
router.get('/supplier-ranking', async (req, res) => {
  try {
    const result = await automationService.rankSuppliers(req.user.company);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Business Insights ───────────────────────────────────────────────────────

// Get all insights
router.get('/insights', async (req, res) => {
  try {
    const { type, status = 'active', limit = 20 } = req.query;
    const filter = { company: req.user.company, status };
    if (type) filter.insightType = type;

    const insights = await BusinessInsight.find(filter)
      .sort({ generatedAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: insights, total: insights.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dismiss insight
router.patch('/insights/:id/dismiss', async (req, res) => {
  try {
    const insight = await BusinessInsight.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status: 'dismissed', actionedBy: req.user._id, actionedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, data: insight });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Automation Logs ─────────────────────────────────────────────────────────

router.get('/logs', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const filter = { company: req.user.company };
    if (status) filter.status = status;

    const [logs, total] = await Promise.all([
      AutomationLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('rule', 'name category'),
      AutomationLog.countDocuments(filter)
    ]);

    res.json({ success: true, data: logs, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
