const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const ExcelJS = require('exceljs');
const multer = require('multer');
const FuelUsage = require('../models/FuelUsage');
const FuelUsageBatch = require('../models/FuelUsageBatch');
const Vehicle = require('../models/Vehicle');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      return callback(new Error('Upload an Excel workbook in .xlsx format'));
    }

    callback(null, true);
  }
});

router.use(
  authenticate,
  authorizeRoles('admin', 'superadmin', 'super_admin', 'super admin', 'super-admin')
);

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const headerAliases = {
  fuelType: new Set(['fuel', 'fueltype', 'product', 'productname']),
  vehicleNumber: new Set([
    'vehicle', 'vehiclenumber', 'vehicleno', 'vehicleid',
    'registrationnumber', 'registrationno', 'regnumber', 'regno', 'platenumber'
  ]),
  quantity: new Set([
    'liters', 'litres', 'trnxlitval', 'trnxlitresval', 'fuelusage',
    'fuelused', 'fuelquantity', 'quantity', 'fuelusageliters',
    'fuelusagelitres', 'fuelquantityliters', 'fuelquantitylitres', 'volume', 'usage'
  ]),
  amount: new Set(['amount', 'trnxrsvalue', 'amountvalue', 'totalamount', 'transactionamount']),
  cardQuota: new Set(['cardquota', 'quota']),
  userName: new Set(['username', 'user', 'drivername'])
};

class SpreadsheetInputError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

const getColumnIndexes = (headerRow) => {
  const indexes = {};

  headerRow.eachCell((cell, columnNumber) => {
    const header = normalizeHeader(cell.value);
    Object.entries(headerAliases).forEach(([key, aliases]) => {
      if (aliases.has(header) && indexes[key] === undefined) {
        indexes[key] = columnNumber;
      }
    });
  });

  return indexes;
};

const getCellValue = (row, columnNumber) => {
  if (!columnNumber) {
    return null;
  }

  const value = row.getCell(columnNumber).value;
  if (value && typeof value === 'object') {
    if (value.result !== undefined) {
      return value.result;
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map(part => part.text).join('');
    }
    if (value.text !== undefined) {
      return value.text;
    }
  }

  return value;
};

const parseNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value ?? '').trim().replace(/,/g, '');
  if (!normalized) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const parseReportMonth = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  const month = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(month.getTime()) ? null : month;
};

const getWorkbookReportMonth = (workbook) => {
  for (const worksheet of workbook.worksheets) {
    let reportMonth = null;
    worksheet.eachRow(row => {
      row.eachCell((cell, columnNumber) => {
        if (normalizeHeader(cell.value) !== 'start') {
          return;
        }

        const value = getCellValue(row, columnNumber + 1);
        const match = String(value ?? '').match(/\b(\d{4})-(\d{2})-\d{2}\b/);
        if (match) {
          reportMonth = parseReportMonth(`${match[1]}-${match[2]}`);
        }
      });

      if (reportMonth) {
        return false;
      }
    });

    if (reportMonth) {
      return reportMonth;
    }
  }

  return null;
};

const parseWorkbookRows = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new SpreadsheetInputError('Unable to read workbook. Ensure the file is a valid .xlsx workbook.');
  }

  const data = {
    fuelTypeRows: [],
    vehicleRows: [],
    reportMonth: getWorkbookReportMonth(workbook)
  };
  const validationErrors = [];
  let foundFuelTypeSheet = false;
  let foundVehicleSheet = false;

  workbook.worksheets.forEach(worksheet => {
    const tables = [];
    worksheet.eachRow((row, rowNumber) => {
      const columns = getColumnIndexes(row);
      const isFuelTypeSheet = columns.fuelType && columns.quantity && columns.amount;
      const isVehicleSheet = columns.vehicleNumber && columns.quantity && columns.amount && columns.cardQuota;

      if (isFuelTypeSheet && isVehicleSheet) {
        validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: fuel and vehicle headers are ambiguous`);
      } else if (isFuelTypeSheet) {
        tables.push({ type: 'fuel-type', headerRow: rowNumber, columns });
      } else if (isVehicleSheet) {
        tables.push({ type: 'vehicle', headerRow: rowNumber, columns });
      }
    });

    tables.forEach((table, tableIndex) => {
      const endRow = (tables[tableIndex + 1]?.headerRow ?? worksheet.rowCount + 1) - 1;
      if (table.type === 'fuel-type') {
        foundFuelTypeSheet = true;
        for (let rowNumber = table.headerRow + 1; rowNumber <= endRow; rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const fuelType = String(getCellValue(row, table.columns.fuelType) ?? '').trim();
          const quantityValue = getCellValue(row, table.columns.quantity);
          const amountValue = getCellValue(row, table.columns.amount);
          if (!fuelType) {
            continue;
          }

          const quantity = parseNumber(quantityValue);
          const amount = parseNumber(amountValue);
          if (quantity === null || quantity <= 0) {
            validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: liters must be greater than zero`);
          } else if (amount === null || amount < 0) {
            validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: amount must be a valid non-negative number`);
          } else {
            data.fuelTypeRows.push({ fuelType, quantity, amount });
          }
        }
      } else {
        foundVehicleSheet = true;
        for (let rowNumber = table.headerRow + 1; rowNumber <= endRow; rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const vehicleNumber = String(getCellValue(row, table.columns.vehicleNumber) ?? '')
            .trim()
            .replace(/[,;]+$/, '')
            .trim()
            .toUpperCase();
          const quantityValue = getCellValue(row, table.columns.quantity);
          const amountValue = getCellValue(row, table.columns.amount);
          if (!vehicleNumber) {
            continue;
          }

          const quotaValue = getCellValue(row, table.columns.cardQuota);
          const hasTransactionData = [quantityValue, amountValue, quotaValue]
            .some(value => value != null && value !== '');
          if (!hasTransactionData) {
            continue;
          }

          const quantity = parseNumber(quantityValue);
          const amount = parseNumber(amountValue);
          const cardQuota = quotaValue == null || quotaValue === '' ? null : parseNumber(quotaValue);
          const userName = String(getCellValue(row, table.columns.userName) ?? '').trim();

          if (quantity === null || quantity <= 0) {
            validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: transaction liters must be greater than zero`);
          } else if (amount === null || amount < 0) {
            validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: transaction amount must be a valid non-negative number`);
          } else if (quotaValue != null && quotaValue !== '' && (cardQuota === null || cardQuota < 0)) {
            validationErrors.push(`Sheet "${worksheet.name}", row ${rowNumber}: card quota must be a non-negative number`);
          } else {
            data.vehicleRows.push({ vehicleNumber, quantity, amount, cardQuota, userName });
          }
        }
      }
    });
  });

  if (validationErrors.length) {
    throw new SpreadsheetInputError(
      'No data was imported. Correct the workbook and upload it again.',
      validationErrors
    );
  }

  if (!foundFuelTypeSheet || !data.fuelTypeRows.length) {
    throw new SpreadsheetInputError('Add a fuel-type sheet with Fuel, Liters, and Amount columns and at least one data row.');
  }
  if (!foundVehicleSheet || !data.vehicleRows.length) {
    throw new SpreadsheetInputError('Add a vehicle sheet with Vehicle, TRNX_Lit_Val, TRNX_Rs_Value, and Card_Quota columns and at least one data row.');
  }

  return data;
};

const getFuelUsageSummary = async (reportMonth) => {
  const monthFilter = { reportMonth };
  const [fuelTypeGroups, vehicleRows, batches] = await Promise.all([
    FuelUsage.aggregate([
      { $match: { ...monthFilter, reportType: 'fuel-type' } },
      {
        $group: {
          _id: '$fuelType',
          liters: { $sum: '$quantity' },
          amount: { $sum: '$amount' },
          entryCount: { $sum: 1 }
        }
      },
      { $sort: { liters: -1, _id: 1 } }
    ]),
    FuelUsage.find({ ...monthFilter, reportType: 'vehicle' })
      .sort({ createdAt: 1, _id: 1 })
      .populate({ path: 'vehicle', select: 'division', populate: { path: 'division', select: 'name' } })
      .select('userName vehicle vehicleNumber quantity amount cardQuota createdAt'),
    FuelUsageBatch.find(monthFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('importedBy', 'name')
      .select('fileName rowCount createdAt importedBy')
  ]);

  const fuelTypeTotals = fuelTypeGroups.map(group => ({
    fuelType: group._id,
    liters: group.liters,
    amount: group.amount || 0,
    entryCount: group.entryCount
  }));
  const perVehicle = vehicleRows.map(row => ({
    _id: row._id,
    userName: row.userName,
    vehicleNumber: row.vehicleNumber,
    liters: row.quantity,
    amount: row.amount,
    cardQuota: row.cardQuota,
    division: row.vehicle?.division?.name || 'Unassigned'
  }));

  return {
    month: reportMonth.toISOString().slice(0, 7),
    totals: {
      totalUsage: fuelTypeTotals.reduce((total, item) => total + item.liters, 0),
      totalAmount: fuelTypeTotals.reduce((total, item) => total + item.amount, 0),
      vehicles: new Set(perVehicle.map(row => row.vehicleNumber)).size,
      fuelTypes: fuelTypeTotals.length,
      vehicleEntries: perVehicle.length
    },
    fuelTypeTotals,
    perVehicle,
    recentImports: batches
  };
};

const uploadWorkbook = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Excel file must be 10 MB or smaller' });
    }

    return res.status(400).json({ error: error.message || 'Unable to upload Excel file' });
  });
};

router.get('/summary', async (req, res) => {
  const reportMonth = parseReportMonth(req.query.month);
  if (!reportMonth) {
    return res.status(400).json({ error: 'A valid month in YYYY-MM format is required' });
  }

  try {
    res.json(await getFuelUsageSummary(reportMonth));
  } catch (error) {
    console.error('Fuel usage summary error:', error);
    res.status(500).json({ error: 'Failed to load fuel usage summary' });
  }
});

router.post('/upload', uploadWorkbook, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Select an .xlsx Excel file to upload' });
  }

  const selectedMonth = parseReportMonth(req.body.month);
  if (!selectedMonth) {
    return res.status(400).json({ error: 'Select a valid report month' });
  }

  try {
    const { fuelTypeRows, vehicleRows, reportMonth: workbookMonth } = await parseWorkbookRows(req.file.buffer);
    const reportMonth = workbookMonth || selectedMonth;
    const vehicleNumbers = [...new Set(vehicleRows.map(row => row.vehicleNumber))];
    const vehicles = await Vehicle.find({ vehicleNumber: { $in: vehicleNumbers } })
      .select('vehicleNumber');
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.vehicleNumber.toUpperCase(), vehicle]));
    const unknownVehicles = vehicleNumbers.filter(vehicleNumber => !vehicleMap.has(vehicleNumber));

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const importedRows = [
      ...fuelTypeRows.map(row => ({
        ...row,
        reportType: 'fuel-type',
        reportMonth
      })),
      ...vehicleRows.map(row => ({
        ...row,
        vehicle: vehicleMap.get(row.vehicleNumber)?._id || null,
        reportType: 'vehicle',
        reportMonth
      }))
    ];

    let batch;
    try {
      batch = await FuelUsageBatch.create({
        fileName: path.basename(req.file.originalname),
        fileHash,
        rowCount: importedRows.length,
        reportMonth,
        importedBy: req.user._id
      });
      await FuelUsage.insertMany(importedRows.map(row => ({ ...row, batch: batch._id })));
    } catch (error) {
      if (batch) {
        await Promise.all([
          FuelUsage.deleteMany({ batch: batch._id }),
          FuelUsageBatch.deleteOne({ _id: batch._id })
        ]);
      }

      throw error;
    }

    res.status(201).json({
      message: `Added ${fuelTypeRows.length} fuel-type rows and ${vehicleRows.length} vehicle rows for ${reportMonth.toISOString().slice(0, 7)}${unknownVehicles.length ? `. ${unknownVehicles.length} vehicle number(s) were not found in Vehicle Management; their rows were imported without a division.` : ''}`,
      unmatchedVehicles: unknownVehicles,
      batch: {
        id: batch._id,
        fileName: batch.fileName,
        rowCount: batch.rowCount,
        reportMonth: reportMonth.toISOString().slice(0, 7),
        createdAt: batch.createdAt
      }
    });
  } catch (error) {
    if (error instanceof SpreadsheetInputError) {
      return res.status(400).json({
        error: error.message,
        details: error.details?.slice(0, 10) || [],
        additionalErrors: Math.max((error.details?.length || 0) - 10, 0)
      });
    }

    console.error('Fuel usage import error:', error);
    res.status(500).json({ error: 'Failed to import fuel usage data' });
  }
});

module.exports = router;
