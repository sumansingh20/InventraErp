'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const vehicleSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

  registrationNumber: { type: String, required: true },
  vehicleType: {
    type: String,
    enum: ['truck', 'van', 'tempo', 'bike', 'car', 'auto', 'three_wheeler', 'other'],
    default: 'van'
  },
  make: String,
  model: String,
  year: Number,
  color: String,
  capacity: { type: Number, default: 0 }, // kg
  capacityUnit: { type: String, default: 'kg' },

  // Driver
  primaryDriver: { type: Schema.Types.ObjectId, ref: 'Employee' },

  // Insurance & Documents
  insuranceNumber: String,
  insuranceExpiry: Date,
  rcExpiry: Date,
  fitnessExpiry: Date,
  permitExpiry: Date,
  pollutionExpiry: Date,

  // GPS
  gpsDeviceId: String,
  lastLocation: { lat: Number, lng: Number, address: String },
  lastLocationAt: Date,

  // Fuel tracking
  fuelType: { type: String, enum: ['petrol', 'diesel', 'cng', 'electric', 'lpg'], default: 'diesel' },
  fuelLogs: [{
    date: Date,
    quantity: Number,
    costPerUnit: Number,
    totalCost: Number,
    odometer: Number,
    filledBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
  }],
  currentOdometer: { type: Number, default: 0 },

  // Maintenance
  lastServiceDate: Date,
  nextServiceDate: Date,
  nextServiceOdometer: Number,

  status: {
    type: String,
    enum: ['available', 'in_use', 'under_maintenance', 'out_of_service', 'retired'],
    default: 'available'
  },

  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

vehicleSchema.index({ company: 1, registrationNumber: 1 }, { unique: true });
vehicleSchema.index({ company: 1, status: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;
