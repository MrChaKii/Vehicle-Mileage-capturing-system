const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  extractedMileage: {
    type: Number,
    required: true,
    min: 0
  },
  rawOcrText: {
    type: String,
    default: ''
  },
  ocrConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  readingDate: {
    type: Date,
    default: Date.now
  },
  // User can correct the value before final save
  isCorrected: {
    type: Boolean,
    default: false
  },
  originalMileage: {
    type: Number,
    default: null  // Stores OCR original if user corrects it
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  submittedBy: {
    type: String,  // or ObjectId if you have auth
    required: true
  }
}, { timestamps: true });

// Prevent duplicate readings for same vehicle on same day (optional)
readingSchema.index({ vehicleId: 1, readingDate: 1 });

module.exports = mongoose.model('Reading', readingSchema);