const normalizeLoginUsername = (value = '') => value
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const usernameFromVehicleNumber = (vehicleNumber) => normalizeLoginUsername(vehicleNumber);

const usernameFromEmployeeId = (employeeId) => normalizeLoginUsername(employeeId);

module.exports = {
  normalizeLoginUsername,
  usernameFromVehicleNumber,
  usernameFromEmployeeId
};
