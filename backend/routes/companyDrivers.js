const express = require('express');
const CompanyDriver = require('../models/CompanyDriver');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

const normalizeDriverInput = (body) => ({
  employeeId: body.employeeId?.trim().toUpperCase(),
  employeeName: body.employeeName?.trim(),
  contactNumber: body.contactNumber?.trim()
});

const validateDriver = ({ employeeId, employeeName, contactNumber }) => {
  if (!employeeId || !employeeName || !contactNumber) {
    return 'Employee ID, Employee Name, and Contact No are required';
  }

  return null;
};

router.get('/', async (req, res) => {
  try {
    const search = req.query.search?.trim();
    const filter = search
      ? {
          $or: [
            { employeeId: new RegExp(search, 'i') },
            { employeeName: new RegExp(search, 'i') },
            { contactNumber: new RegExp(search, 'i') }
          ]
        }
      : {};

    const drivers = await CompanyDriver.find(filter)
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json(drivers);
  } catch (error) {
    console.error('Company driver list error:', error);
    res.status(500).json({ error: 'Failed to load company drivers' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const driver = await CompanyDriver.findById(req.params.id).select('-__v');

    if (!driver) {
      return res.status(404).json({ error: 'Company driver not found' });
    }

    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load company driver' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeDriverInput(req.body);
    const validationError = validateDriver(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const driver = await CompanyDriver.create(payload);
    res.status(201).json(driver);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }

    console.error('Company driver create error:', error);
    res.status(500).json({ error: 'Failed to create company driver' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = normalizeDriverInput(req.body);
    const validationError = validateDriver(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const driver = await CompanyDriver.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!driver) {
      return res.status(404).json({ error: 'Company driver not found' });
    }

    res.json(driver);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }

    console.error('Company driver update error:', error);
    res.status(500).json({ error: 'Failed to update company driver' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const driver = await CompanyDriver.findByIdAndDelete(req.params.id);

    if (!driver) {
      return res.status(404).json({ error: 'Company driver not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete company driver' });
  }
});

module.exports = router;
