const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

divisionSchema.index({ name: 'text', code: 'text', description: 'text' });

module.exports = mongoose.model('Division', divisionSchema);