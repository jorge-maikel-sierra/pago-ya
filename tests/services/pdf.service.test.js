import { describe, it, expect } from '@jest/globals';
import {
  generateLoanPDF,
  formatCOP,
  translateStatus,
  translateFrequency,
} from '../../src/services/pdf.service.js';

const sampleLoan = {
  clientName: 'María García López',
  documentNumber: '1001234567',
  collectorName: 'Juan Cobrador',
  principalAmount: '200000.00',
  interestRate: '0.0033',
  totalAmount: '219800.00',
  totalPaid: '73266.67',
  outstandingBalance: '146533.33',
  moraAmount: '0.00',
  numberOfPayments: 30,
  paidPayments: 10,
  disbursementDate: '2026-02-01',
  expectedEndDate: '2026-03-15',
  status: 'ACTIVE',
  paymentFrequency: 'DAILY',
};

const generateSchedule = (count) =>
  Array.from({ length: count }, (_, i) => ({
    installmentNumber: i + 1,
    dueDate: `2026-02-${String(i + 2).padStart(2, '0')}`,
    amountDue: '7326.67',
    principalDue: '6666.67',
    interestDue: '660.00',
    amountPaid: i < 10 ? '7326.67' : '0.00',
    isPaid: i < 10,
  }));

describe('formatCOP', () => {
  it('formats a plain number', () => {
    expect(formatCOP('200000.00')).toBe('$200,000.00');
  });

  it('formats zero', () => {
    expect(formatCOP('0')).toBe('$0.00');
  });

  it('formats small values', () => {
    expect(formatCOP('5.5')).toBe('$5.50');
  });

  it('formats large values with commas', () => {
    expect(formatCOP('1234567.89')).toBe('$1,234,567.89');
  });
});

describe('translateStatus', () => {
  it('translates ACTIVE to Activo', () => {
    expect(translateStatus('ACTIVE')).toBe('Activo');
  });

  it('translates PENDING to Pendiente', () => {
    expect(translateStatus('PENDING')).toBe('Pendiente');
  });

  it('translates COMPLETED to Completado', () => {
    expect(translateStatus('COMPLETED')).toBe('Completado');
  });

  it('translates DEFAULTED to En mora', () => {
    expect(translateStatus('DEFAULTED')).toBe('En mora');
  });

  it('translates CANCELLED to Cancelado', () => {
    expect(translateStatus('CANCELLED')).toBe('Cancelado');
  });

  it('returns original string for unknown status', () => {
    expect(translateStatus('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('translateFrequency', () => {
  it('translates DAILY to Diario', () => {
    expect(translateFrequency('DAILY')).toBe('Diario');
  });

  it('translates WEEKLY to Semanal', () => {
    expect(translateFrequency('WEEKLY')).toBe('Semanal');
  });

  it('translates BIWEEKLY to Quincenal', () => {
    expect(translateFrequency('BIWEEKLY')).toBe('Quincenal');
  });

  it('translates MONTHLY to Mensual', () => {
    expect(translateFrequency('MONTHLY')).toBe('Mensual');
  });

  it('returns original string for unknown frequency', () => {
    expect(translateFrequency('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('generateLoanPDF', () => {
  it('returns a valid PDF buffer', async () => {
    const schedule = generateSchedule(5);
    const buffer = await generateLoanPDF(sampleLoan, schedule);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('starts with PDF magic bytes', async () => {
    const schedule = generateSchedule(3);
    const buffer = await generateLoanPDF(sampleLoan, schedule);
    const header = buffer.subarray(0, 5).toString('ascii');

    expect(header).toBe('%PDF-');
  });

  it('handles an empty schedule', async () => {
    const buffer = await generateLoanPDF(sampleLoan, []);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles a large schedule (multiple pages)', async () => {
    const schedule = generateSchedule(100);
    const buffer = await generateLoanPDF(sampleLoan, schedule);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('throws if loan is undefined', () => {
    expect(() => generateLoanPDF(undefined, [])).toThrow('loan es requerido y debe ser un objeto');
  });

  it('throws if loan is not an object', () => {
    expect(() => generateLoanPDF('string', [])).toThrow('loan es requerido y debe ser un objeto');
  });

  it('throws if schedule is not an array', () => {
    expect(() => generateLoanPDF(sampleLoan, 'not-array')).toThrow('schedule debe ser un array');
  });

  it('produces larger buffer for more installments', async () => {
    const small = await generateLoanPDF(sampleLoan, generateSchedule(5));
    const large = await generateLoanPDF(sampleLoan, generateSchedule(50));

    expect(large.length).toBeGreaterThan(small.length);
  });
});
