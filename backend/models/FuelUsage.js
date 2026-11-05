const mongoose = require('mongoose');

const fuelUsageSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
    index: true
  },
  vehicleNumber: {
    type: String,
    trim: true,
    default: ''
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FuelUsageBatch',
    required: true
  },
  reportType: {
    type: String,
    enum: ['fuel-type', 'vehicle'],
    required: true,
    index: true
  },
  reportMonth: {
    type: Date,
    required: true,
    index: true
  },
  fuelType: {
    type: String,
    trim: true,
    default: ''
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    min: 0,
    default: null
  },
  cardQuota: {
    type: Number,
    min: 0,
    default: null
  },
  userName: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

fuelUsageSchema.index({ reportMonth: 1, reportType: 1 });

module.exports = mongoose.model('FuelUsage', fuelUsageSchema);
