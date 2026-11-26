const ExcelJS = require('exceljs');

const columns = [
  ['Date / Time (Sri Lanka)', 28],
  ['Vehicle', 16],
  ['Meter', 16],
  ['User', 27],
  ['Reason', 44],
  ['Before Mileage (km)', 23],
  ['Mileage (km)', 18],
  ['Driven KM', 16],
  ['Submitted By', 26]
];
const headerRowNumber = 1;
const reasonColumnWidth = 42;
const colomboDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const toColomboExcelDate = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;

  // Excel dates store a wall-clock time without a time zone.
  const parts = Object.fromEntries(colomboDateTime.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
};

const createReadingsWorkbook = () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AutoInsights';
  const sheet = workbook.addWorksheet('Mileage readings', {
    properties: { tabColor: { argb: 'FF17365D' } },
    views: [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }]
  });
  sheet.columns = columns.map(([, width]) => ({ width }));

  const header = sheet.getRow(headerRowNumber);
  header.values = columns.map(([label]) => label);
  header.height = 28;
  header.eachCell(cell => {
    cell.fill = solidFill('FF17365D');
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { right: { style: 'thin', color: { argb: 'FF7087A1' } } };
  });

  const appendReadings = (readings) => {
    for (const reading of readings) {
      const reason = reading.reason || '';
      const row = sheet.addRow([
        toColomboExcelDate(reading.readingDate),
        reading.vehicleId,
        reading.meterType ? (reading.isRental ? 'RENTAL ' : '') + reading.meterType.toUpperCase() : null,
        reading.driverName ? reading.driverName + ' (Driver)' : reading.submittedByName || reading.submittedBy,
        reason || null,
        reading.beforeMileage ?? null,
        reading.extractedMileage ?? null,
        reading.mileageGap ?? null,
        reading.submittedByName || 'Unknown User'
      ]);
      const lines = reason.split(/\r\n|\r|\n/).reduce(
        (count, line) => count + Math.max(1, Math.ceil(line.length / reasonColumnWidth)), 0
      );
      row.height = Math.max(21, 6 + 14 * lines);
      const isBandedRow = (row.number - headerRowNumber) % 2 === 0;
      const fill = solidFill(isBandedRow ? 'FFF1F5F9' : 'FFFFFFFF');
      row.eachCell({ includeEmpty: true }, (cell, index) => {
        const isMileage = index >= 6 && index <= 8;
        cell.fill = fill;
        cell.font = {
          name: 'Arial',
          size: 10,
          bold: index === 8,
          color: { argb: index === 8 ? 'FF17365D' : 'FF334155' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: isMileage ? 'right' : 'left',
          indent: 1,
          wrapText: index === 5
        };
      });
      row.getCell(1).numFmt = 'dd mmm yyyy hh:mm:ss';
      for (const index of [6, 7, 8]) {
        const cell = row.getCell(index);
        cell.numFmt = typeof cell.value === 'number' && !Number.isInteger(cell.value)
          ? '#,##0.0#######'
          : '#,##0';
      }
    }
  };

  const writeBuffer = () => {
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
    return workbook.xlsx.writeBuffer();
  };

  return { appendReadings, writeBuffer };
};

module.exports = createReadingsWorkbook;
