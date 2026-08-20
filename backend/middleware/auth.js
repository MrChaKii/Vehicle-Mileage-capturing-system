const User = require('../models/User');
const { verifyToken } = require('../utils/token');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('name email employeeId username contactNumber role vehicleId isActive');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User account is not active' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }

  next();
};

module.exports = {
  authenticate,
  authorizeRoles
};
