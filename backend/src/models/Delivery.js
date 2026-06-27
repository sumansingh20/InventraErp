'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const trackingEventSchema = new Schema({
  status: String,
  location: { lat: Number, lng: Number, address: String },
  timestamp: { type: Date, default: Date.now },
  notes: String
}, { _id: false });

const deliverySchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

  deliveryNumber: { type: String, required: true, unique: true },

  // Source documents
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },

  // Parties
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },

  // Items
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    unit: String,
    serial: { type: Schema.Types.ObjectId, ref: 'Serial' }
  }],

  // Delivery Agent
  deliveryAgent: { type: Schema.Types.ObjectId, ref: 'Employee' },
  agentName: String,
  agentPhone: String,
  vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle' },

  // Addresses
  pickupAddress: {
    line1: String, city: String, state: String, pincode: String,
    coordinates: { lat: Number, lng: Number }
  },
  deliveryAddress: {
    line1: String, city: String, state: String, pincode: String,
    coordinates: { lat: Number, lng: Number }
  },

  // Scheduling
  scheduledAt: Date,
  dispatchedAt: Date,
  estimatedDeliveryAt: Date,
  deliveredAt: Date,

  // Live GPS
  currentLocation: { lat: Number, lng: Number },
  lastLocationUpdatedAt: Date,

  // Status lifecycle
  status: {
    type: String,
    enum: ['scheduled', 'picking', 'packed', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'],
    default: 'scheduled'
  },

  // Tracking history
  trackingEvents: [trackingEventSchema],

  // Proof of Delivery
  pod: {
    signatureUrl: String,
    photoUrl: String,
    receivedBy: String,
    receivedAt: Date,
    gpsCoordinates: { lat: Number, lng: Number },
    otp: String,
    otpVerified: { type: Boolean, default: false }
  },

  // Failure
  failureReason: String,
  attemptCount: { type: Number, default: 1 },

  // Route optimization
  routeOptimized: { type: Boolean, default: false },
  estimatedDistance: Number, // km
  estimatedDuration: Number, // minutes

  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

deliverySchema.index({ company: 1, status: 1 });
deliverySchema.index({ company: 1, deliveryAgent: 1 });
deliverySchema.index({ company: 1, deliveryNumber: 1 });

const Delivery = mongoose.model('Delivery', deliverySchema);
module.exports = Delivery;
