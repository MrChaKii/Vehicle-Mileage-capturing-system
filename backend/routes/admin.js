const express = require('express');
const Reading = require('../models/Reading');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

router.get('/summary', async (req, res) => {
  try {
    const [
      totalReadings,
      totalVehicles,
      vehicleNumbers,
      totalUsers,
      activeUsers,
      correctedReadings,
      confidenceAgg,
      recentReadings
    ] = await Promise.all([
      Reading.countDocuments(),
      Vehicle.countDocuments(),
      Vehicle.distinct('vehicleNumber'),
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Reading.countDocuments({ isCorrected: true }),
      Reading.aggregate([
        { $group: { _id: null, averageConfidence: { $avg: '$ocrConfidence' } } }
      ]),
      Reading.find()
        .sort({ readingDate: -1 })
        .limit(10)
        .select('-__v')
    ]);

    res.json({
      totals: {
        readings: totalReadings,
        vehicles: totalVehicles,
        users: totalUsers,
        activeUsers,
        correctedReadings,
        averageConfidence: confidenceAgg[0]?.averageConfidence || 0
      },
      vehicles: vehicleNumbers.sort(),
      recentReadings
    });
  } catch (error) {
    console.error('Admin summary error:', error);
    res.status(500).json({ error: 'Failed to load admin summary' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('name email employeeId username contactNumber role vehicleId isActive createdAt');

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

module.exports = router;
