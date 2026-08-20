const mongoose = require('mongoose');

const companyDriverSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  }
}, { timestamps: true });

companyDriverSchema.index({ employeeId: 'text', employeeName: 'text', contactNumber: 'text' });

module.exports = mongoose.model('CompanyDriver', companyDriverSchema);
