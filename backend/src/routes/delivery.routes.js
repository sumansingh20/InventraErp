'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Delivery = require('../models/Delivery');
const Vehicle = require('../models/Vehicle');
const { requireRole } = require('../middleware/rbac');

router.use(authenticate);

// ─── Deliveries ────────────────────────────────────────────────────────────

// List deliveries
router.get('/', async (req, res) => {
  try {
    const { status, agent, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company };
    if (status) filter.status = status;
    if (agent) filter.deliveryAgent = agent;

    const [deliveries, total] = await Promise.all([
      Delivery.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('customer', 'name phone')
        .populate('deliveryAgent', 'name phone')
        .populate('vehicle', 'registrationNumber vehicleType'),
      Delivery.countDocuments(filter)
    ]);

    res.json({ success: true, data: deliveries, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create delivery
router.post('/', async (req, res) => {
  try {
    const count = await Delivery.countDocuments({ company: req.user.company });
    const deliveryNumber = `DEL-${String(count + 1).padStart(6, '0')}`;

    const delivery = await Delivery.create({
      ...req.body,
      company: req.user.company,
      deliveryNumber,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: delivery, message: 'Delivery scheduled' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get single delivery with full tracking
router.get('/:id', async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.id, company: req.user.company })
      .populate('customer', 'name phone email address')
      .populate('deliveryAgent', 'name phone')
      .populate('vehicle', 'registrationNumber vehicleType make model')
      .populate('items.product', 'name sku');
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
    res.json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update delivery status + GPS
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, location, notes } = req.body;
    const update = { status };
    if (status === 'dispatched') update.dispatchedAt = new Date();
    if (status === 'delivered') update.deliveredAt = new Date();
    if (location) {
      update.currentLocation = location;
      update.lastLocationUpdatedAt = new Date();
      update.$push = {
        trackingEvents: { status, location, notes, timestamp: new Date() }
      };
    }
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      update,
      { new: true }
    );
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
    res.json({ success: true, data: delivery });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Upload Proof of Delivery
router.patch('/:id/pod', async (req, res) => {
  try {
    const { signatureUrl, photoUrl, receivedBy, gpsCoordinates, otp } = req.body;
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      {
        pod: { signatureUrl, photoUrl, receivedBy, receivedAt: new Date(), gpsCoordinates, otpVerified: true },
        status: 'delivered',
        deliveredAt: new Date()
      },
      { new: true }
    );
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
    res.json({ success: true, data: delivery, message: 'Proof of delivery recorded' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Vehicles ─────────────────────────────────────────────────────────────

router.get('/vehicles/list', async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ company: req.user.company, isActive: true })
      .populate('primaryDriver', 'name phone');
    res.json({ success: true, data: vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/vehicles', requireRole(['admin', 'company_owner']), async (req, res) => {
  try {
    const vehicle = await Vehicle.create({ ...req.body, company: req.user.company, createdBy: req.user._id });
    res.status(201).json({ success: true, data: vehicle, message: 'Vehicle added' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Add fuel log
router.post('/vehicles/:id/fuel-log', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $push: { fuelLogs: { ...req.body, filledBy: req.user._id } } },
      { new: true }
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.json({ success: true, data: vehicle });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
