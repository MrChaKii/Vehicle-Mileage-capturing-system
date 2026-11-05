const mongoose = require('mongoose');

const fuelUsageBatchSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileHash: {
    type: String,
    required: true
  },
  rowCount: {
    type: Number,
    required: true,
    min: 1
  },
  reportMonth: {
    type: Date,
    required: true,
    index: true
  },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('FuelUsageBatch', fuelUsageBatchSchema);
