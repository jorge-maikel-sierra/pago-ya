import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import {
  generateFixedDailySchedule,
  isBusinessDay,
  nextBusinessDay,
} from '../../src/engine/amortization.js';

describe('isBusinessDay', () => {
  const holidays = new Set(['2026-03-23']);

  it('returns true for a regular weekday', () => {
    expect(isBusinessDay(dayjs('2026-03-02'), holidays)).toBe(true);
  });

  it('returns false for Saturday', () => {
    expect(isBusinessDay(dayjs('2026-02-28'), holidays)).toBe(false);
  });

  it('returns false for Sunday', () => {
    expect(isBusinessDay(dayjs('2026-03-01'), holidays)).toBe(false);
  });

  it('returns false for a holiday', () => {
    expect(isBusinessDay(dayjs('2026-03-23'), holidays)).toBe(false);
  });
});

describe('nextBusinessDay', () => {
  const holidays = new Set(['2026-03-23']);

  it('returns the next day when it is a weekday', () => {
    const result = nextBusinessDay(dayjs('2026-03-02'), holidays);
    expect(result.format('YYYY-MM-DD')).toBe('2026-03-03');
  });

  it('skips Saturday and Sunday', () => {
    const result = nextBusinessDay(dayjs('2026-02-27'), holidays);
    expect(result.format('YYYY-MM-DD')).toBe('2026-03-02');
  });

  it('skips holidays', () => {
    const result = nextBusinessDay(dayjs('2026-03-20'), holidays);
    expect(result.format('YYYY-MM-DD')).toBe('2026-03-24');
  });
});

describe('generateFixedDailySchedule', () => {
  const baseParams = {
    principal: '100000',
    totalRate: '0.05', // 5% de interés total sobre el capital
    termDays: 20,
    startDate: '2026-03-02',
    holidays: [],
  };

  describe('basic schedule generation', () => {
    it('returns the correct number of installments', () => {
      const result = generateFixedDailySchedule(baseParams);
      expect(result.schedule).toHaveLength(20);
    });

    it('calculates totalInterest correctly using Decimal math (simple interest)', () => {
      const result = generateFixedDailySchedule(baseParams);
      // Interés simple: principal × tasa total
      const expectedInterest = new Decimal('100000').mul('0.05');
      expect(result.totalInterest).toBe(expectedInterest.toFixed(2));
    });

    it('calculates totalAmount as principal + interest', () => {
      const result = generateFixedDailySchedule(baseParams);
      const total = new Decimal(result.totalInterest).plus('100000');
      expect(result.totalAmount).toBe(total.toFixed(2));
    });

    it('numbers installments sequentially from 1', () => {
      const result = generateFixedDailySchedule(baseParams);
      const numbers = result.schedule.map((s) => s.installmentNumber);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it('assigns only business days as due dates', () => {
      const result = generateFixedDailySchedule(baseParams);
      result.schedule.forEach((installment) => {
        const d = dayjs(installment.dueDate);
        const dayOfWeek = d.day();
        expect(dayOfWeek).not.toBe(0);
        expect(dayOfWeek).not.toBe(6);
      });
    });

    it('sets expectedEndDate to the last installment dueDate', () => {
      const result = generateFixedDailySchedule(baseParams);
      expect(result.expectedEndDate).toBe(result.schedule[19].dueDate);
    });
  });

  describe('rounding and adjustment on last installment', () => {
    it('sums of all principalDue equals the original principal', () => {
      const result = generateFixedDailySchedule(baseParams);
      const totalPrincipal = result.schedule.reduce(
        (acc, s) => acc.plus(s.principalDue),
        new Decimal(0),
      );
      expect(totalPrincipal.toFixed(2)).toBe('100000.00');
    });

    it('sums of all interestDue equals totalInterest', () => {
      const result = generateFixedDailySchedule(baseParams);
      const totalInt = result.schedule.reduce((acc, s) => acc.plus(s.interestDue), new Decimal(0));
      expect(totalInt.toFixed(2)).toBe(result.totalInterest);
    });

    it('sums of all amountDue equals totalAmount', () => {
      const result = generateFixedDailySchedule(baseParams);
      const totalAmt = result.schedule.reduce((acc, s) => acc.plus(s.amountDue), new Decimal(0));
      expect(totalAmt.toFixed(2)).toBe(result.totalAmount);
    });

    it('handles amounts that do not divide evenly', () => {
      const result = generateFixedDailySchedule({
        ...baseParams,
        principal: '100000',
        totalRate: '0.05',
        termDays: 3,
      });
      const totalAmt = result.schedule.reduce((acc, s) => acc.plus(s.amountDue), new Decimal(0));
      expect(totalAmt.toFixed(2)).toBe(result.totalAmount);
    });
  });

  describe('holidays handling', () => {
    it('skips holidays in the schedule', () => {
      const result = generateFixedDailySchedule({
        ...baseParams,
        startDate: '2026-03-22',
        holidays: ['2026-03-23'],
        termDays: 3,
      });
      const dates = result.schedule.map((s) => s.dueDate);
      expect(dates).not.toContain('2026-03-23');
    });

    it('skips multiple consecutive holidays', () => {
      const result = generateFixedDailySchedule({
        ...baseParams,
        startDate: '2026-03-22',
        holidays: ['2026-03-23', '2026-03-24'],
        termDays: 2,
      });
      expect(result.schedule[0].dueDate).toBe('2026-03-25');
      expect(result.schedule[1].dueDate).toBe('2026-03-26');
    });
  });

  describe('zero interest rate', () => {
    it('works with totalRate = 0 (interest-free loan)', () => {
      const result = generateFixedDailySchedule({
        ...baseParams,
        totalRate: '0',
      });
      expect(result.totalInterest).toBe('0.00');
      expect(result.totalAmount).toBe('100000.00');
      result.schedule.forEach((s) => {
        expect(s.interestDue).toBe('0.00');
      });
    });
  });

  describe('input validation', () => {
    it('throws if principal is zero', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, principal: '0' })).toThrow(
        'El capital (principal) debe ser mayor a cero',
      );
    });

    it('throws if principal is negative', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, principal: '-5000' })).toThrow(
        'El capital (principal) debe ser mayor a cero',
      );
    });

    it('throws if totalRate is negative', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, totalRate: '-0.01' })).toThrow(
        'La tasa total (totalRate) no puede ser negativa',
      );
    });

    it('throws if termDays is zero', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, termDays: 0 })).toThrow(
        'El plazo (termDays) debe ser un entero positivo',
      );
    });

    it('throws if termDays is not an integer', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, termDays: 5.5 })).toThrow(
        'El plazo (termDays) debe ser un entero positivo',
      );
    });

    it('throws if startDate is invalid', () => {
      expect(() => generateFixedDailySchedule({ ...baseParams, startDate: 'not-a-date' })).toThrow(
        'La fecha de inicio (startDate) no es válida',
      );
    });
  });

  describe('realistic scenario: Colombian micro-loan', () => {
    it('generates a 30-day micro-loan of $200,000 COP at 5% total interest', () => {
      const result = generateFixedDailySchedule({
        principal: '200000',
        totalRate: '0.05', // 5% de interés total
        termDays: 30,
        startDate: '2026-03-02',
        holidays: ['2026-03-23'],
      });

      expect(result.schedule).toHaveLength(30);
      // Interés simple: 200,000 × 0.05 = 10,000
      expect(result.totalInterest).toBe('10000.00');
      expect(result.totalAmount).toBe('210000.00');

      const allDates = result.schedule.map((s) => s.dueDate);
      expect(allDates).not.toContain('2026-03-23');

      allDates.forEach((date) => {
        const d = dayjs(date);
        expect(d.day()).not.toBe(0);
        expect(d.day()).not.toBe(6);
      });

      const totalPrincipal = result.schedule.reduce(
        (acc, s) => acc.plus(s.principalDue),
        new Decimal(0),
      );
      expect(totalPrincipal.toFixed(2)).toBe('200000.00');
    });
  });
});
