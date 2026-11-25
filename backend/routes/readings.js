const express = require('express');
const router = express.Router();
const multer = require('multer');
const Reading = require('../models/Reading');
const Vehicle = require('../models/Vehicle');
const CompanyDriver = require('../models/CompanyDriver');
const Division = require('../models/Division');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { uploadMeterPhoto, downloadMeterPhoto, deleteMeterPhoto } = require('../utils/cloudinary');

// Calendar date (YYYY-MM-DD) in Sri Lankan time.
const getColomboDateKey = (value) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const getPart = (type) => parts.find(part => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

// All YYYY-MM-DD keys from start to end, inclusive, to count the days a pool vehicle was used for the daily avg.
const getDateKeysBetween = (startKey, endKey) => {
  const keys = [];
  const cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
};

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'super admin', 'super-admin'];

const MAX_METER_IMAGE_SIZE = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_METER_IMAGE_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Meter photo must be a JPEG, PNG, or WebP image'));
    }
    callback(null, true);
  }
});

const MAX_POOL_IN_TO_OUT_GAP_KM = 1;
const latestReadingOrder = { readingDate: -1, _id: -1 };
const normalizeDriverName = (name) => (name || '').trim().toLowerCase();

const getOpenVehicleReadings = (vehicleNumbers) => Reading.aggregate([
  { $match: { vehicleId: { $in: vehicleNumbers } } },
  { $sort: latestReadingOrder },
  {
    $group: {
      _id: { vehicleId: '$vehicleId', isRental: { $eq: [{ $ifNull: ['$isRental', false] }, true] } },
      latest: { $first: '$$ROOT' }
    }
  },
  { $match: { 'latest.meterType': 'out' } },
  { $replaceWith: '$latest' },
  { $project: { vehicleId: 1, driverName: 1, division: 1, divisionName: 1, reason: 1, isRental: 1 } }
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const uploadMeterImage = (req, res, next) => {
  upload.single('meterImage')(req, res, error => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    next();
  });
};

router.use(authenticate);

// GET /api/readings/options — Return vehicles, company drivers, divisions, and users for driver login dropdowns
router.get('/options', async (req, res) => {
  try {
    const isDriver = req.user.role === 'driver';
    const vehicleFilter = isDriver ? { ownership: 'pool' } : { status: 'active' };
    const loadUsers = async () => {
      const userFilter = { role: 'user', isActive: true };
      if (isDriver) {
        const assignments = await Vehicle.find({ allocatedUser: { $ne: null } })
          .select('allocatedUser ownership')
          .lean();
        const companyUserIds = assignments
          .filter(vehicle => vehicle.ownership === 'company')
          .map(vehicle => vehicle.allocatedUser);
        const personalUserIds = assignments
          .filter(vehicle => vehicle.ownership === 'personal')
          .map(vehicle => vehicle.allocatedUser);
        const assignedUserIds = assignments.map(vehicle => vehicle.allocatedUser);

        userFilter._id = { $nin: personalUserIds };
        userFilter.$or = [
          { _id: { $in: companyUserIds } },
          // Older accounts can have an assignment stored only on the user record.
          { _id: { $nin: assignedUserIds }, vehicleId: { $in: ['', null] } }
        ];
      }
      return User.find(userFilter).sort({ name: 1 }).select('name');
    };

    const [vehicles, companyDrivers, divisions, users] = await Promise.all([
      Vehicle.find(vehicleFilter).sort({ vehicleNumber: 1 }).select('vehicleNumber make name model ownership status'),
      CompanyDriver.find().sort({ employeeName: 1 }).select('employeeId employeeName'),
      Division.find().sort({ name: 1 }).select('name'),
      loadUsers()
    ]);

    if (!isDriver) {
      return res.json({ vehicles, companyDrivers, divisions, users });
    }

    const openReadings = await getOpenVehicleReadings(vehicles.map(vehicle => vehicle.vehicleNumber));
    const unavailableVehicles = new Set(openReadings.map(reading => reading.vehicleId));
    const rentalVehicles = new Set(openReadings.filter(reading => reading.isRental).map(reading => reading.vehicleId));
    const poolTrips = openReadings.filter(reading => !reading.isRental);
    const unavailablePeople = new Set(poolTrips.map(reading => normalizeDriverName(reading.driverName)));
    const openTrips = poolTrips
      .filter(reading => !rentalVehicles.has(reading.vehicleId))
      .sort((left, right) => left.vehicleId.localeCompare(right.vehicleId));

    res.json({
      vehicles: vehicles.filter(vehicle => vehicle.status === 'active' && !unavailableVehicles.has(vehicle.vehicleNumber)),
      companyDrivers: companyDrivers.filter(driver => !unavailablePeople.has(normalizeDriverName(driver.employeeName))),
      users: users.filter(user => !unavailablePeople.has(normalizeDriverName(user.name))),
      divisions,
      openTrips
    });
  } catch (error) {
    console.error('Options load error:', error);
    res.status(500).json({ error: 'Failed to load options' });
  }
});

// POST /api/readings — Save a manually entered reading with its camera photo
router.post('/', uploadMeterImage, async (req, res) => {
  try {
    const { vehicleId, mileage, location, driverName, division, divisionName, reason, poolTripAction, checkoutId } = req.body;
    const rentalRequested = req.body.isRental === 'true';

    if (!req.file) {
      return res.status(400).json({ error: 'A camera photo is required' });
    }

    const mileageNumber = Number(mileage);
    if (!vehicleId || mileage === undefined || String(mileage).trim() === ''
      || !Number.isSafeInteger(mileageNumber) || mileageNumber < 0) {
      return res.status(400).json({ error: 'A valid vehicle ID and mileage are required' });
    }

    let parsedLocation = null;
    if (location) {
      try {
        parsedLocation = JSON.parse(location);
      } catch {
        return res.status(400).json({ error: 'Invalid location data' });
      }
    }

    const normalizedVehicleId = vehicleId.toUpperCase().trim();

    // Rental and normal readings are separate odometer streams. A rental
    // odometer must never become the minimum allowed mileage for the user's
    // assigned vehicle.
    const [lastNormalReading, lastRentalReading] = await Promise.all([
      Reading.findOne({
        vehicleId: normalizedVehicleId,
        isRental: { $ne: true }
      }).sort(latestReadingOrder),
      Reading.findOne({ vehicleId: normalizedVehicleId, isRental: true }).sort(latestReadingOrder)
    ]);

    const rentalIsOpen = lastRentalReading?.meterType === 'out';
    if (rentalIsOpen && !rentalRequested) {
      return res.status(409).json({
        error: 'This vehicle is checked out as a rental. Record its IN return reading before using normal vehicle readings.'
      });
    }

    if (rentalRequested && !rentalIsOpen && lastNormalReading?.meterType === 'out') {
      return res.status(409).json({
        error: 'This vehicle is already checked out. Record its IN return reading before starting a rental.'
      });
    }

    const poolVehicle = !rentalRequested && req.user.role === 'driver'
      ? await Vehicle.findOne({ vehicleNumber: normalizedVehicleId, ownership: 'pool' }).select('status')
      : null;

    if (poolTripAction && (!poolVehicle || !['out', 'in'].includes(poolTripAction))) {
      return res.status(409).json({ error: 'This pool trip is no longer available. Refresh the driver workspace.' });
    }

    // Older clients infer OUT or IN. The workspace sends the intended action
    // so an outdated selection cannot accidentally record the opposite action.
    let meterType = null;
    if (rentalRequested) {
      meterType = rentalIsOpen ? 'in' : 'out';
    } else if (poolVehicle) {
      const isVehicleOut = lastNormalReading?.meterType === 'out';
      const personName = normalizeDriverName(driverName);

      if (poolTripAction === 'in' && (!isVehicleOut || lastNormalReading._id.toString() !== checkoutId)) {
        return res.status(409).json({ error: 'This checkout has changed. Select the open trip again before recording a return.' });
      }
      if (poolTripAction === 'out' && isVehicleOut) {
        return res.status(409).json({ error: 'This vehicle is already checked out. Select another vehicle or return the open trip.' });
      }
      if (isVehicleOut && normalizeDriverName(lastNormalReading.driverName) !== personName) {
        return res.status(409).json({
          error: `This vehicle is currently out with ${lastNormalReading.driverName}. Only they can return it.`
        });
      }

      meterType = isVehicleOut ? 'in' : 'out';
      if (meterType === 'out') {
        if (poolVehicle.status !== 'active' || !personName) {
          return res.status(400).json({ error: 'Select an active pool vehicle and a driver or special user.' });
        }

        const poolVehicleNumbers = await Vehicle.distinct('vehicleNumber', { ownership: 'pool' });
        const openReadings = await getOpenVehicleReadings(poolVehicleNumbers);
        if (openReadings.some(reading => !reading.isRental && normalizeDriverName(reading.driverName) === personName)) {
          return res.status(409).json({ error: 'This person already has an open trip. Record its IN reading before starting another trip.' });
        }
      }
    }

    // A rental return is checked against its matching OUT reading. A fresh
    // rental checkout may be a different hired vehicle, so it starts without
    // inheriting an older rental odometer. Normal readings always use the last
    // non-rental reading for the assigned vehicle.
    const comparisonReading = rentalRequested
      ? (rentalIsOpen ? lastRentalReading : null)
      : lastNormalReading;

    if (comparisonReading && mileageNumber < comparisonReading.extractedMileage) {
      return res.status(400).json({
        error: 'Mileage is less than last recorded reading',
        lastReading: comparisonReading.extractedMileage,
        hint: 'Odometer cannot decrease. Check for misread digits.'
      });
    }

    // Pool vehicles: last IN and next OUT should be at most 1km apart.
    // A larger gap is informational only; the reading is still saved.
    const exceedsPoolGap = !rentalRequested
      && meterType === 'out'
      && lastNormalReading?.meterType === 'in'
      && mileageNumber - lastNormalReading.extractedMileage > MAX_POOL_IN_TO_OUT_GAP_KM;

    let cloudinaryPublicId;
    try {
      const fileNamePart = value => value.replace(/[^a-zA-Z0-9_-]/g, '_');
      const vehicleNumber = vehicleId.toUpperCase().trim();
      const timestamp = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-');
      const fileName = [
        fileNamePart(vehicleNumber),
        fileNamePart(req.user.username),
        timestamp
      ].join('_');

      cloudinaryPublicId = await uploadMeterPhoto({
        buffer: req.file.buffer,
        fileName
      });
    } catch (error) {
      console.error('Cloudinary meter photo upload error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status
      });
      return res.status(502).json({
        error: error.message.startsWith('Cloudinary configuration is missing:')
          ? error.message
          : 'Could not upload the meter photo to Cloudinary. Check backend logs and Cloudinary configuration.'
      });
    }

    const reading = new Reading({
      vehicleId: vehicleId.toUpperCase().trim(),
      extractedMileage: mileageNumber,
      meterImageCloudinaryId: cloudinaryPublicId,
      meterImageContentType: req.file.mimetype,
      hasMeterImage: true,
      isCorrected: false,
      location: parsedLocation,
      submittedBy: req.user._id.toString(),
      driverName: poolTripAction === 'in' ? lastNormalReading.driverName : driverName || '',
      division: poolTripAction === 'in' ? lastNormalReading.division : division || null,
      divisionName: poolTripAction === 'in' ? lastNormalReading.divisionName : divisionName || '',
      reason: poolTripAction === 'in' ? lastNormalReading.reason : reason || '',
      meterType,
      isRental: rentalRequested
    });

    try {
      await reading.save();
    } catch (error) {
      try {
        await deleteMeterPhoto(cloudinaryPublicId);
      } catch (cleanupError) {
        console.error('Cloudinary orphaned meter photo cleanup error:', cleanupError);
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      reading: {
        id: reading._id,
        vehicleId: reading.vehicleId,
        mileage: reading.extractedMileage,
        date: reading.readingDate,
        meterType: reading.meterType,
        isRental: reading.isRental,
        hasMeterImage: true
      },
      ...(exceedsPoolGap && {
        warning: `Your OUT meter is more than ${MAX_POOL_IN_TO_OUT_GAP_KM} km larger than the last IN meter reading for this vehicle.`
      })
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save reading' });
  }
});

const getExportMileage = async (reading) => {
  if (reading.meterType === 'out') {
    return { beforeMileage: null, mileageGap: null };
  }

  const previousReading = await Reading.findOne({
    vehicleId: reading.vehicleId,
    isRental: reading.isRental === true ? true : { $ne: true },
    ...(reading.meterType === 'in' && { meterType: { $in: ['out', 'in'] } }),
    $or: [
      { readingDate: { $lt: reading.readingDate } },
      { readingDate: reading.readingDate, _id: { $lt: reading._id } }
    ]
  })
    .sort(latestReadingOrder)
    .select('extractedMileage meterType')
    .lean();

  if (!previousReading || (reading.meterType === 'in' && previousReading.meterType !== 'out')) {
    return { beforeMileage: null, mileageGap: null };
  }

  return {
    beforeMileage: previousReading.extractedMileage,
    mileageGap: reading.extractedMileage - previousReading.extractedMileage
  };
};

// GET /api/readings — All readings (admin, filterable + paginated)
router.get('/', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { vehicleId, driverName, userKey, startDate, endDate, ownership, month, page = 1 } = req.query;
    const PAGE_SIZE = 50;

    const filter = {};
    if (vehicleId) filter.vehicleId = { $regex: vehicleId.trim(), $options: 'i' };
    else if (ownership) {
      const ownershipVehicles = await Vehicle.find({ ownership }).select('vehicleNumber');
      const vehicleNumbers = ownershipVehicles.map(v => v.vehicleNumber);
      filter.vehicleId = vehicleNumbers.length ? { $in: vehicleNumbers } : { $in: [] };
    }
    if (driverName) filter.driverName = { $regex: driverName.trim(), $options: 'i' };
    if (userKey) {
      const [type, ...valueParts] = userKey.split(':');
      const value = valueParts.join(':').trim();

      if (type === 'user' && value) {
        // New readings store the authenticated user's id in submittedBy.
        filter.submittedBy = value;
      }

      if (type === 'driver' && value) {
        // Company-driver readings are identified by the driver name selected at capture time.
        filter.driverName = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
      }
    }
    if (startDate || endDate) {
      filter.readingDate = {};
      if (startDate) filter.readingDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.readingDate.$lte = end;
      }
    } else if (month) {
      const [year, monthIndex] = String(month).split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
        filter.readingDate = {
          $gte: new Date(Date.UTC(year, monthIndex - 1, 1)),
          $lt: new Date(Date.UTC(year, monthIndex, 1))
        };
      }
    }

    const skip = (parseInt(page, 10) - 1) * PAGE_SIZE;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const todayFilter = { readingDate: { $gte: todayStart, $lt: tomorrowStart } };

    const [readings, total, todayTotalReadings, allVehicleCount, regularUserCount, companyDriverCount, todayCorrectedRecords] = await Promise.all([
      Reading.find(filter)
        .sort(latestReadingOrder)
        .skip(skip)
        .limit(PAGE_SIZE)
        .select('-__v'),
      Reading.countDocuments(filter),
      Reading.countDocuments(todayFilter),
      Vehicle.countDocuments(),
      User.countDocuments({ role: { $ne: 'driver' } }),
      CompanyDriver.countDocuments(),
      Reading.countDocuments({ ...todayFilter, isCorrected: true })
    ]);
    const allUserCount = regularUserCount + companyDriverCount;

    const submittedByValues = [...new Set(readings.map(reading => String(reading.submittedBy || '')).filter(Boolean))];
    const objectIdValues = submittedByValues.filter(value => /^[a-f\d]{24}$/i.test(value));
    const [users, exportMileage] = await Promise.all([
      User.find({
        $or: [
          ...(objectIdValues.length ? [{ _id: { $in: objectIdValues } }] : []),
          { username: { $in: submittedByValues } },
          { employeeId: { $in: submittedByValues } }
        ]
      }).select('name username employeeId'),
      req.query.includeMileageGap === 'true' ? Promise.all(readings.map(getExportMileage)) : []
    ]);
    const userMap = new Map();
    users.forEach(user => {
      userMap.set(user._id.toString(), user);
      if (user.username) userMap.set(user.username, user);
      if (user.employeeId) userMap.set(user.employeeId, user);
    });
    const readingsWithUserNames = readings.map((reading, index) => ({
      ...reading.toObject(),
      ...exportMileage[index],
      submittedByName: userMap.get(String(reading.submittedBy))?.name || userMap.get(String(reading.submittedBy))?.username || 'Unknown User'
    }));

    res.json({
      readings: readingsWithUserNames,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / PAGE_SIZE),
      pageSize: PAGE_SIZE,
      stats: {
        todayTotalReadings,
        allVehicleCount,
        allUserCount,
        todayCorrectedRecords
      }
    });
  } catch (error) {
    console.error('Admin readings list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/readings/irregular-pool — Pool OUT readings too far above the previous IN (must be BEFORE /:vehicleId)
router.get('/irregular-pool', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const vehicleIds = await Reading.distinct('vehicleId', { meterType: 'in' });
    const readings = await Reading.find({ vehicleId: { $in: vehicleIds } })
      .sort({ vehicleId: 1, readingDate: 1 })
      .select('vehicleId extractedMileage readingDate driverName meterType')
      .lean();

    const rows = [];
    readings.forEach((outReading, index) => {
      const inReading = readings[index - 1];
      if (
        inReading?.vehicleId === outReading.vehicleId
        && inReading.meterType === 'in'
        && outReading.meterType === 'out'
        && outReading.extractedMileage - inReading.extractedMileage > MAX_POOL_IN_TO_OUT_GAP_KM
      ) {
        rows.push({
          _id: outReading._id,
          vehicleId: outReading.vehicleId,
          inMeter: inReading.extractedMileage,
          inTime: inReading.readingDate,
          inDriver: inReading.driverName,
          outMeter: outReading.extractedMileage,
          outTime: outReading.readingDate,
          outDriver: outReading.driverName,
          gap: outReading.extractedMileage - inReading.extractedMileage
        });
      }
    });

    rows.sort((left, right) => new Date(right.outTime) - new Date(left.outTime));
    res.json(rows);
  } catch (error) {
    console.error('Irregular pool readings error:', error);
    res.status(500).json({ error: 'Failed to load irregular pool readings' });
  }
});

function* getCompletedTrips(readings) {
  let outReading = null;

  for (const reading of readings) {
    if (reading.meterType === 'out') {
      outReading = reading;
    } else if (reading.meterType === 'in' && outReading) {
      yield { outReading, inReading: reading };
      outReading = null;
    }
  }
}

// GET /api/readings/stats/:vehicleId — Aggregated stats (must be BEFORE /:vehicleId)
router.get('/stats/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase();

    const [history, vehicle] = await Promise.all([
      Reading.find({ vehicleId })
        .sort({ readingDate: 1, _id: 1 })
        .select('extractedMileage readingDate meterType isRental')
        .lean(),
      Vehicle.findOne({ vehicleNumber: vehicleId }).select('ownership')
    ]);

    const readings = history.filter(reading => reading.isRental !== true);
    const rentalReadings = history.filter(reading => reading.isRental === true);
    let rentalDistance = 0;
    let completedRentalTrips = 0;

    for (const { outReading, inReading } of getCompletedTrips(rentalReadings)) {
      const distance = inReading.extractedMileage - outReading.extractedMileage;
      if (Number.isFinite(distance) && distance >= 0) {
        rentalDistance += distance;
        completedRentalTrips += 1;
      }
    }

    const totalReadings = readings.length;
    let vehicleDistance = 0;
    let averageDaily = 0;

    if (vehicle?.ownership === 'pool') {
      // Pool vehicles, per completed trip:
      // - total km adds up (IN meter - OUT meter)
      // - days used collects every calendar date from OUT to IN (inclusive); a same-day
      //   trip counts only if the vehicle moved. Each date is counted once.
      const usedDates = new Set();

      for (const { outReading, inReading } of getCompletedTrips(readings)) {
        const tripDistance = inReading.extractedMileage - outReading.extractedMileage;
        vehicleDistance += Math.max(0, tripDistance);

        const outDateKey = getColomboDateKey(new Date(outReading.readingDate));
        const inDateKey = getColomboDateKey(new Date(inReading.readingDate));

        if (outDateKey !== inDateKey) {
          getDateKeysBetween(outDateKey, inDateKey).forEach(dateKey => usedDates.add(dateKey));
        } else if (tripDistance !== 0) {
          usedDates.add(inDateKey);
        }
      }

      averageDaily = usedDates.size > 0 ? Math.round(vehicleDistance / usedDates.size) : 0;
    } else if (totalReadings > 1) {
      const first = readings[0];
      const last = readings[totalReadings - 1];
      vehicleDistance = last.extractedMileage - first.extractedMileage;
      // Days between first and last reading (minimum 1 to avoid division by zero)
      const daysDiff = Math.max(
        1,
        Math.round((new Date(last.readingDate) - new Date(first.readingDate)) / (1000 * 60 * 60 * 24))
      );
      averageDaily = Math.round(vehicleDistance / daysDiff);
    }

    res.json({
      totalReadings,
      totalDistance: Math.max(0, vehicleDistance) + rentalDistance,
      rentalDistance,
      completedRentalTrips,
      averageDaily
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/readings/:id — Admin can correct only the saved mileage value
router.put('/:id', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const mileage = Number(req.body.mileage);

    if (!Number.isFinite(mileage) || mileage < 0) {
      return res.status(400).json({ error: 'A valid mileage value is required' });
    }

    const reading = await Reading.findById(req.params.id);

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    const previousMileage = reading.extractedMileage;
    reading.extractedMileage = mileage;

    if (mileage !== previousMileage && reading.originalMileage == null) {
      reading.originalMileage = previousMileage;
    }

    reading.isCorrected = mileage !== previousMileage || reading.isCorrected;
    await reading.save();

    res.json({ success: true, reading });
  } catch (error) {
    console.error('Admin reading update error:', error);
    res.status(500).json({ error: 'Failed to update reading' });
  }
});

// DELETE /api/readings/:id — Admin can remove an incorrect reading
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const reading = await Reading.findById(req.params.id).select('+meterImageCloudinaryId');

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    await Reading.findByIdAndDelete(req.params.id);

    if (reading.meterImageCloudinaryId) {
      try {
        await deleteMeterPhoto(reading.meterImageCloudinaryId);
      } catch (error) {
        console.error('Cloudinary meter photo deletion error:', error);
        return res.status(502).json({ error: 'Reading deleted, but its Cloudinary photo could not be deleted.' });
      }
    }

    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Admin reading delete error:', error);
    res.status(500).json({ error: 'Failed to delete reading' });
  }
});

// GET /api/readings/:id/image — Saved odometer photo
router.get('/:id/image', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const reading = await Reading.findById(req.params.id)
      .select('+meterImageCloudinaryId +meterImageContentType');
    if (!reading?.meterImageCloudinaryId) {
      return res.status(404).json({ error: 'Meter photo not found' });
    }

    const image = await downloadMeterPhoto(reading.meterImageCloudinaryId);
    res.set('Cache-Control', 'private, no-store');
    res.type(image.contentType || reading.meterImageContentType || 'application/octet-stream').send(image.buffer);
  } catch (error) {
    console.error('Meter photo load error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(502).json({
      error: error.message.startsWith('Cloudinary configuration is missing:')
        ? error.message
        : 'Failed to load meter photo from Cloudinary. Check backend logs and Cloudinary configuration.'
    });
  }
});

// GET /api/readings/rental-status/:vehicleId — Current rental checkout state
router.get('/rental-status/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase().trim();
    const latestRentalReading = await Reading.findOne({ vehicleId, isRental: true })
      .sort({ readingDate: -1 })
      .select('meterType');

    res.json({ isOut: latestRentalReading?.meterType === 'out' });
  } catch (error) {
    console.error('Rental status load error:', error);
    res.status(500).json({ error: 'Failed to load rental status' });
  }
});

// GET /api/readings/:vehicleId — History
router.get('/:vehicleId', async (req, res) => {
  try {
    const readings = await Reading.find({ 
      vehicleId: req.params.vehicleId.toUpperCase() 
    })
    .sort({ readingDate: -1 })
    .limit(100)
    .select('-__v');  // Exclude version key
    
    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
