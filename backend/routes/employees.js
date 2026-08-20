const express = require('express');
const Employee = require('../models/Employee');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

const normalizeEmployeeInput = (body) => ({
  employeeId: body.employeeId?.trim().toUpperCase(),
  employeeName: body.employeeName?.trim(),
  username: body.username?.trim().toLowerCase(),
  contactNumber: body.contactNumber?.trim()
});

const validateEmployee = ({ employeeId, employeeName, username, contactNumber }) => {
  if (!employeeId || !employeeName || !username || !contactNumber) {
    return 'Employee ID, Employee Name, Username, and Contact Number are required';
  }

  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return 'Username can only contain letters, numbers, dots, underscores, and hyphens';
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
            { username: new RegExp(search, 'i') },
            { contactNumber: new RegExp(search, 'i') }
          ]
        }
      : {};

    const employees = await Employee.find(filter)
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json(employees);
  } catch (error) {
    console.error('Employee list error:', error);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select('-__v');

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = normalizeEmployeeInput(req.body);
    const validationError = validateEmployee(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const employee = await Employee.create(payload);
    res.status(201).json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Employee ID or Username already exists' });
    }

    console.error('Employee create error:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = normalizeEmployeeInput(req.body);
    const validationError = validateEmployee(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Employee ID or Username already exists' });
    }

    console.error('Employee update error:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

module.exports = router;
