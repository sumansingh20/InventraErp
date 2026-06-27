'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { MarketplaceOrder, MarketplaceListing, ChannelConnection } = require('../models/Marketplace');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// ─── Channel Connections ──────────────────────────────────────────────────────

// List connected channels
router.get('/channels', async (req, res) => {
  try {
    const channels = await ChannelConnection.find({ company: req.user.company })
      .select('-credentials');
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Connect a new channel
router.post('/channels', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const conn = await ChannelConnection.create({
      ...req.body,
      company: req.user.company,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: { ...conn.toObject(), credentials: undefined }, message: 'Channel connected' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update channel
router.put('/channels/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const conn = await ChannelConnection.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body, { new: true }
    ).select('-credentials');
    if (!conn) return res.status(404).json({ success: false, message: 'Channel not found' });
    res.json({ success: true, data: conn });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Delete/disconnect channel
router.delete('/channels/:id', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    await ChannelConnection.deleteOne({ _id: req.params.id, company: req.user.company });
    res.json({ success: true, message: 'Channel disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

// List marketplace orders
router.get('/orders', async (req, res) => {
  try {
    const { channel, status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company };
    if (channel) filter.channel = channel;
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      MarketplaceOrder.find(filter)
        .sort({ orderDate: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('customer', 'name phone')
        .populate('invoice', 'invoiceNumber'),
      MarketplaceOrder.countDocuments(filter)
    ]);

    res.json({ success: true, data: orders, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single marketplace order
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await MarketplaceOrder.findOne({ _id: req.params.id, company: req.user.company })
      .populate('customer', 'name phone email')
      .populate('items.product', 'name sku images')
      .populate('invoice', 'invoiceNumber grandTotal paymentStatus');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Manually create/import an order
router.post('/orders', async (req, res) => {
  try {
    const order = await MarketplaceOrder.findOneAndUpdate(
      { company: req.user.company, channel: req.body.channel, channelOrderId: req.body.channelOrderId },
      { ...req.body, company: req.user.company, lastSyncedAt: new Date(), syncStatus: 'synced' },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, data: order, message: 'Order imported' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update order status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status, trackingId, courierPartner } = req.body;
    const update = { status };
    if (trackingId) update.trackingId = trackingId;
    if (courierPartner) update.courierPartner = courierPartner;
    if (status === 'shipped') update.shippedAt = new Date();
    if (status === 'delivered') update.deliveredAt = new Date();

    const order = await MarketplaceOrder.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      update, { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Listings ─────────────────────────────────────────────────────────────────

router.get('/listings', async (req, res) => {
  try {
    const { channel, product, status } = req.query;
    const filter = { company: req.user.company };
    if (channel) filter.channel = channel;
    if (product) filter.product = product;
    if (status) filter.listingStatus = status;

    const listings = await MarketplaceListing.find(filter)
      .populate('product', 'name sku primaryImage currentStock sellingPrice');
    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/listings', async (req, res) => {
  try {
    const listing = await MarketplaceListing.findOneAndUpdate(
      { company: req.user.company, product: req.body.product, channel: req.body.channel },
      { ...req.body, company: req.user.company, createdBy: req.user._id },
      { upsert: true, new: true }
    ).populate('product', 'name sku');
    res.status(201).json({ success: true, data: listing, message: 'Product listed' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Sync Operations ──────────────────────────────────────────────────────────

// Sync inventory to all connected channels
router.post('/sync/inventory', requireRole(['admin', 'company_owner', 'inventory_manager']), async (req, res) => {
  try {
    const { Inventory } = require('../models/Inventory');
    const listings = await MarketplaceListing.find({
      company: req.user.company,
      listingStatus: 'active',
      autoSyncStock: true
    }).populate('product', 'currentStock');

    let synced = 0;
    for (const listing of listings) {
      const inventory = await Inventory.aggregate([
        { $match: { company: req.user.company, product: listing.product?._id } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]);
      const stock = Math.max(0, (inventory[0]?.total || 0) - listing.minStock);
      await MarketplaceListing.findByIdAndUpdate(listing._id, {
        channelStock: stock,
        stockSyncedAt: new Date(),
        lastSyncedAt: new Date()
      });
      synced++;
    }

    res.json({ success: true, message: `Synced stock for ${synced} listings`, synced });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Channel stats summary
router.get('/stats', async (req, res) => {
  try {
    const stats = await MarketplaceOrder.aggregate([
      { $match: { company: req.user.company } },
      { $group: {
        _id: '$channel',
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$grandTotal' },
        pendingOrders: { $sum: { $cond: [{ $in: ['$status', ['pending', 'confirmed', 'processing']] }, 1, 0] } }
      }},
      { $sort: { totalRevenue: -1 } }
    ]);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
