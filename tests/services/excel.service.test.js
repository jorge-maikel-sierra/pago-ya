import { describe, it, expect } from '@jest/globals';
import ExcelJS from 'exceljs';
import { generateDailyPortfolioExcel } from '../../src/services/excel.service.js';

const sampleRows = [
  {
    clientName: 'María García',
    documentNumber: '1001234567',
    phone: '3001234567',
    address: 'Calle 10 #5-20',
    loanId: 'loan-001',
    status: 'ACTIVE',
    installmentNumber: 15,
    amountDue: '7326.67',
    outstandingBalance: '146533.33',
    moraAmount: '0.00',
    collectorName: 'Juan Cobrador',
    routeName: 'Ruta Centro',
  },
  {
    clientName: 'Pedro Pérez',
    documentNumber: '1009876543',
    phone: '3109876543',
    address: 'Carrera 8 #12-30',
    loanId: 'loan-002',
    status: 'ACTIVE',
    installmentNumber: 5,
    amountDue: '10000.00',
    outstandingBalance: '250000.00',
    moraAmount: '1500.00',
    collectorName: 'Juan Cobrador',
    routeName: 'Ruta Centro',
  },
];

const baseOptions = {
  organizationName: 'Paga Diario Test',
  reportDate: '2026-02-22',
  rows: sampleRows,
};

const parseExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
};

describe('generateDailyPortfolioExcel', () => {
  it('returns a valid Buffer', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('creates a readable xlsx workbook', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);

    expect(workbook.worksheets.length).toBe(1);
    expect(workbook.worksheets[0].name).toBe('Cartera del Día');
  });

  it('includes organization name in title row', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.getCell('A1').value).toContain('Paga Diario Test');
  });

  it('includes report date in date row', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.getCell('A2').value).toContain('2026-02-22');
  });

  it('creates header row with correct labels', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];
    const headerRow = sheet.getRow(4);

    expect(headerRow.getCell(1).value).toBe('#');
    expect(headerRow.getCell(2).value).toBe('Cliente');
    expect(headerRow.getCell(7).value).toBe('Monto Cuota');
    expect(headerRow.getCell(9).value).toBe('Mora');
  });

  it('includes correct number of data rows', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    // Row 4 = header, rows 5-6 = data (2 rows), row 7 = totals
    expect(sheet.getRow(5).getCell(2).value).toBe('María García');
    expect(sheet.getRow(6).getCell(2).value).toBe('Pedro Pérez');
  });

  it('calculates totals correctly using Decimal.js', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    // Totals row = header(4) + data(2) + 1 = row 7
    const totalsRow = sheet.getRow(7);

    // 7326.67 + 10000.00 = 17326.67
    expect(totalsRow.getCell(7).value).toBeCloseTo(17326.67, 2);
    // 146533.33 + 250000.00 = 396533.33
    expect(totalsRow.getCell(8).value).toBeCloseTo(396533.33, 2);
    // 0.00 + 1500.00 = 1500.00
    expect(totalsRow.getCell(9).value).toBeCloseTo(1500.0, 2);
  });

  it('handles empty rows array', async () => {
    const buffer = await generateDailyPortfolioExcel({
      ...baseOptions,
      rows: [],
    });
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    // Totals row should be row 5 (header at 4, no data, totals at 5)
    const totalsRow = sheet.getRow(5);
    expect(totalsRow.getCell(7).value).toBe(0);
    expect(totalsRow.getCell(8).value).toBe(0);
    expect(totalsRow.getCell(9).value).toBe(0);
  });

  it('handles rows with missing optional fields', async () => {
    const rowWithoutOptionals = [
      {
        clientName: 'Ana Test',
        documentNumber: '123',
        loanId: 'loan-x',
        status: 'ACTIVE',
        installmentNumber: 1,
        amountDue: '5000.00',
        outstandingBalance: '50000.00',
        moraAmount: '0.00',
        collectorName: 'Cobrador',
      },
    ];

    const buffer = await generateDailyPortfolioExcel({
      ...baseOptions,
      rows: rowWithoutOptionals,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('throws if organizationName is missing', async () => {
    await expect(
      generateDailyPortfolioExcel({ reportDate: '2026-01-01', rows: [] }),
    ).rejects.toThrow('organizationName es requerido');
  });

  it('throws if reportDate is missing', async () => {
    await expect(
      generateDailyPortfolioExcel({ organizationName: 'Test', rows: [] }),
    ).rejects.toThrow('reportDate es requerido');
  });

  it('throws if rows is not an array', async () => {
    await expect(
      generateDailyPortfolioExcel({
        organizationName: 'Test',
        reportDate: '2026-01-01',
        rows: 'invalid',
      }),
    ).rejects.toThrow('rows debe ser un array');
  });

  it('sets workbook creator to Paga Diario', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);

    expect(workbook.creator).toBe('Paga Diario');
  });

  it('includes summary row with client count', async () => {
    const buffer = await generateDailyPortfolioExcel(baseOptions);
    const workbook = await parseExcel(buffer);
    const sheet = workbook.worksheets[0];

    // After totals row (7), empty row (8), summary row (9)
    const summaryRow = sheet.getRow(9);
    expect(summaryRow.getCell(1).value).toContain('Total clientes: 2');
  });
});
