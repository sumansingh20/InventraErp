'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const DeviceSession = require('../models/DeviceSession');
const { AuditLog } = require('../models/Notification');
const FraudAlert = require('../models/FraudAlert');

router.use(authenticate);

// ─── Active Sessions ──────────────────────────────────────────────────────────

// List all active sessions (admin view)
router.get('/sessions', async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    // Non-admins can only see their own sessions
    if (!req.user.isSuperAdmin && !['admin', 'company_owner'].includes(req.user.customRole)) {
      filter.user = req.user._id;
    }

    const sessions = await DeviceSession.find(filter)
      .populate('user', 'name email customRole')
      .sort({ lastActivityAt: -1 });

    res.json({ success: true, data: sessions, total: sessions.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get current user's own sessions
router.get('/sessions/mine', async (req, res) => {
  try {
    const sessions = await DeviceSession.find({ user: req.user._id, isActive: true })
      .sort({ lastActivityAt: -1 });
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Kill a specific session
router.delete('/sessions/:sessionId', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const session = await DeviceSession.findOneAndUpdate(
      { sessionId: req.params.sessionId, company: req.user.company },
      { isActive: false, logoutAt: new Date(), logoutReason: 'admin_kill' },
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, message: 'Session terminated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Kill all sessions for a user (force logout)
router.delete('/sessions/user/:userId', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const result = await DeviceSession.updateMany(
      { user: req.params.userId, company: req.user.company, isActive: true },
      { isActive: false, logoutAt: new Date(), logoutReason: 'admin_kill' }
    );
    res.json({ success: true, message: `${result.modifiedCount} sessions terminated` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Activity / Audit Log ─────────────────────────────────────────────────────

router.get('/activity-log', async (req, res) => {
  try {
    const { user, module, action, from, to, page = 1, limit = 50 } = req.query;
    const filter = { company: req.user.company };

    if (!req.user.isSuperAdmin && !['admin', 'company_owner'].includes(req.user.customRole)) {
      filter.user = req.user._id;
    } else if (user) {
      filter.user = user;
    }

    if (module) filter.module = module;
    if (action) filter.action = action;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ success: true, data: logs, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Security Dashboard ───────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      activeSessions,
      todayLogins,
      openAlerts,
      recentActivity
    ] = await Promise.all([
      DeviceSession.countDocuments({ company: req.user.company, isActive: true }),
      DeviceSession.countDocuments({ company: req.user.company, loginAt: { $gte: today } }),
      FraudAlert.countDocuments({ company: req.user.company, status: 'open' }),
      AuditLog.find({ company: req.user.company })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'name email')
    ]);

    // Unique users online
    const uniqueOnlineUsers = await DeviceSession.distinct('user', {
      company: req.user.company,
      isActive: true
    });

    res.json({
      success: true,
      data: {
        activeSessions,
        uniqueUsersOnline: uniqueOnlineUsers.length,
        todayLogins,
        openFraudAlerts: openAlerts,
        recentActivity
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── IP Rules (whitelist/blacklist) ──────────────────────────────────────────

// This is a placeholder — IP rules would be stored in company settings
router.get('/ip-rules', async (req, res) => {
  try {
    const Company = require('../models/Company');
    const company = await Company.findById(req.user.company).select('security').lean();
    res.json({ success: true, data: company?.security?.ipRules || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ip-rules', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const Company = require('../models/Company');
    await Company.findByIdAndUpdate(req.user.company, {
      $push: { 'security.ipRules': req.body }
    });
    res.json({ success: true, message: 'IP rule added' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
