import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';

/**
 * @typedef {object} PortfolioRow
 * @property {string} clientName - Nombre completo del cliente
 * @property {string} documentNumber - Número de documento
 * @property {string} phone - Teléfono del cliente
 * @property {string} address - Dirección del cliente
 * @property {string} loanId - UUID del préstamo
 * @property {string} status - Estado del préstamo
 * @property {number} installmentNumber - Número de cuota del día
 * @property {string} amountDue - Monto esperado de la cuota
 * @property {string} outstandingBalance - Saldo pendiente del préstamo
 * @property {string} moraAmount - Mora acumulada
 * @property {string} collectorName - Nombre del cobrador
 * @property {string} routeName - Nombre de la ruta
 */

/**
 * @typedef {object} PortfolioReportOptions
 * @property {string} organizationName - Nombre de la organización
 * @property {string} reportDate - Fecha del reporte (YYYY-MM-DD)
 * @property {PortfolioRow[]} rows - Filas de datos de la cartera
 */

const BRAND_GREEN = '00C566';
const BRAND_NAVY = '0A1628';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_NAVY } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const CURRENCY_FORMAT = '#,##0.00';

/**
 * Genera un reporte Excel de la cartera de cobro del día.
 * Incluye encabezado con nombre de organización y fecha,
 * columnas formateadas con totales al final.
 *
 * @param {PortfolioReportOptions} options - Opciones del reporte
 * @returns {Promise<Buffer>} Buffer del archivo .xlsx
 * @throws {Error} Si las opciones no son válidas
 */
const generateDailyPortfolioExcel = async ({ organizationName, reportDate, rows }) => {
  if (!organizationName || typeof organizationName !== 'string') {
    throw new Error('organizationName es requerido');
  }
  if (!reportDate || typeof reportDate !== 'string') {
    throw new Error('reportDate es requerido');
  }
  if (!Array.isArray(rows)) {
    throw new Error('rows debe ser un array');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Paga Diario';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Cartera del Día', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  // --- Title row ---
  sheet.mergeCells('A1:K1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${organizationName} — Cartera de Cobro`;
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND_NAVY } };
  titleCell.alignment = { horizontal: 'center' };

  // --- Date row ---
  sheet.mergeCells('A2:K2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Fecha: ${reportDate}`;
  dateCell.font = { size: 11, color: { argb: '666666' } };
  dateCell.alignment = { horizontal: 'center' };

  // --- Empty row ---
  sheet.addRow([]);

  // --- Column definitions ---
  const columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Cliente', key: 'clientName', width: 25 },
    { header: 'Documento', key: 'documentNumber', width: 15 },
    { header: 'Teléfono', key: 'phone', width: 14 },
    { header: 'Dirección', key: 'address', width: 25 },
    { header: 'Cuota #', key: 'installmentNumber', width: 10 },
    { header: 'Monto Cuota', key: 'amountDue', width: 15 },
    { header: 'Saldo Pendiente', key: 'outstandingBalance', width: 16 },
    { header: 'Mora', key: 'moraAmount', width: 14 },
    { header: 'Cobrador', key: 'collectorName', width: 20 },
    { header: 'Ruta', key: 'routeName', width: 15 },
  ];

  // --- Header row (row 4) ---
  const headerRow = sheet.addRow(columns.map((col) => col.header));
  headerRow.eachCell((cell) => {
    /* eslint-disable no-param-reassign */
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BRAND_GREEN } },
    };
    /* eslint-enable no-param-reassign */
  });

  // Set column widths
  columns.forEach((col, idx) => {
    const excelCol = sheet.getColumn(idx + 1);
    excelCol.width = col.width;
  });

  // --- Data rows ---
  let totalAmountDue = new Decimal(0);
  let totalOutstanding = new Decimal(0);
  let totalMora = new Decimal(0);

  rows.forEach((row, idx) => {
    const amountDue = new Decimal(row.amountDue || '0');
    const outstanding = new Decimal(row.outstandingBalance || '0');
    const mora = new Decimal(row.moraAmount || '0');

    totalAmountDue = totalAmountDue.plus(amountDue);
    totalOutstanding = totalOutstanding.plus(outstanding);
    totalMora = totalMora.plus(mora);

    const dataRow = sheet.addRow([
      idx + 1,
      row.clientName,
      row.documentNumber,
      row.phone || '',
      row.address || '',
      row.installmentNumber,
      Number(amountDue.toFixed(2)),
      Number(outstanding.toFixed(2)),
      Number(mora.toFixed(2)),
      row.collectorName,
      row.routeName || '',
    ]);

    // Apply currency format to monetary columns (7, 8, 9)
    [7, 8, 9].forEach((colNum) => {
      const cell = dataRow.getCell(colNum);
      cell.numFmt = CURRENCY_FORMAT;
    });

    // Zebra striping
    if (idx % 2 === 1) {
      dataRow.eachCell((cell) => {
        /* eslint-disable no-param-reassign */
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
        /* eslint-enable no-param-reassign */
      });
    }
  });

  // --- Totals row ---
  const totalsRow = sheet.addRow([
    '',
    '',
    '',
    '',
    '',
    'TOTALES',
    Number(totalAmountDue.toFixed(2)),
    Number(totalOutstanding.toFixed(2)),
    Number(totalMora.toFixed(2)),
    '',
    '',
  ]);

  totalsRow.eachCell((cell) => {
    /* eslint-disable no-param-reassign */
    cell.font = { bold: true, size: 10 };
    cell.border = {
      top: { style: 'double', color: { argb: BRAND_NAVY } },
    };
    /* eslint-enable no-param-reassign */
  });

  [7, 8, 9].forEach((colNum) => {
    const cell = totalsRow.getCell(colNum);
    cell.numFmt = CURRENCY_FORMAT;
  });

  // --- Summary row ---
  sheet.addRow([]);
  const summaryRow = sheet.addRow([
    `Total clientes: ${rows.length}`,
    '',
    '',
    '',
    '',
    '',
    `Total a cobrar: ${totalAmountDue.toFixed(2)}`,
  ]);
  summaryRow.getCell(1).font = { bold: true, size: 10, color: { argb: BRAND_NAVY } };
  summaryRow.getCell(7).font = {
    bold: true,
    size: 10,
    color: { argb: BRAND_GREEN.replace('#', '') },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export { generateDailyPortfolioExcel };
