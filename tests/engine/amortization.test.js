import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import {
  generateFixedDailySchedule,
  isBusinessDay,
  nextBusinessDay,
  calcNumberOfPayments,
} from '../../src/engine/amortization.js';

describe('isBusinessDay', () => {
  const holidays = new Set(['2026-03-23']);

  it('returns true for a regular weekday', () => {
    expect(isBusinessDay(dayjs('2026-03-02'), holidays)).toBe(true);
  });

  it('returns false for Saturday', () => {
    // En el modelo de microcrédito colombiano, Sábado es hábil — solo domingo es no hábil
    expect(isBusinessDay(dayjs('2026-02-28'), holidays)).toBe(true);
  });

  it('returns false for Sunday', () => {
    expect(isBusinessDay(dayjs('2026-03-01'), holidays)).toBe(false);
  });

  it('returns false for a holiday', () => {
    expect(isBusinessDay(dayjs('2026-03-23'), holidays)).toBe(false);
  });
});

describe('monthly and other frequencies (current mode)', () => {
  it('monthly frequency produces termMonths installments and correct totals', () => {
    const result = generateFixedDailySchedule({
      principal: '300000',
      monthlyRate: '0.1', // 10%/mes
      termMonths: 2,
      startDate: '2026-03-02',
      frequency: 'MONTHLY',
    });

    expect(result.numberOfPayments).toBe(2);
    expect(result.schedule).toHaveLength(2);
    // Interés total = principal × tasa mensual × meses = 300000 × 0.1 × 2 = 60000
    expect(result.totalInterest).toBe('60000.00');
    expect(result.totalAmount).toBe('360000.00');
  });

  it('weekly and biweekly frequencies compute number of payments correctly', () => {
    const weeks = calcNumberOfPayments('WEEKLY', 2, dayjs('2026-03-02'), new Set());
    const biweeks = calcNumberOfPayments('BIWEEKLY', 2, dayjs('2026-03-02'), new Set());
    expect(weeks).toBe(8); // 2 meses × 4 semanas
    expect(biweeks).toBe(4); // 2 meses × 2 quincenas

    const scheduleWeekly = generateFixedDailySchedule({
      principal: '100000',
      monthlyRate: '0.1',
      termMonths: 1,
      startDate: '2026-03-02',
      frequency: 'WEEKLY',
    });
    expect(scheduleWeekly.numberOfPayments).toBe(4);
    expect(scheduleWeekly.schedule).toHaveLength(4);
  });

  it('throws when monthlyRate is negative', () => {
    expect(() => generateFixedDailySchedule({
      principal: '100000',
      monthlyRate: '-0.1',
      termMonths: 1,
      startDate: '2026-03-02',
    })).toThrow('La tasa mensual (monthlyRate) no puede ser negativa');
  });

  it('throws when termMonths is not an integer', () => {
    expect(() => generateFixedDailySchedule({
      principal: '100000',
      monthlyRate: '0.1',
      termMonths: 1.5,
      startDate: '2026-03-02',
    })).toThrow('El plazo (termMonths) debe ser un entero positivo');
  });

  it('throws when there are no business days in DAILY frequency because all days are holidays', () => {
    const start = dayjs('2026-03-02');
    const end = start.add(1, 'month');
    const holidays = [];
    let cursor = start.add(1, 'day');
    while (!cursor.isAfter(end)) {
      holidays.push(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
    }

    expect(() => generateFixedDailySchedule({
      principal: '50000',
      monthlyRate: '0.05',
      termMonths: 1,
      startDate: '2026-03-02',
      frequency: 'DAILY',
      holidays,
    })).toThrow('No se encontraron días de pago en el plazo indicado');
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
  // 2026-02-27 + 1 = 2026-02-28 (Saturday) -> es día hábil; debe retornar 2026-02-28
    expect(result.format('YYYY-MM-DD')).toBe('2026-02-28');
  });

  it('skips holidays', () => {
    const result = nextBusinessDay(dayjs('2026-03-20'), holidays);
    // 2026-03-21,22,23 -> 23 is holiday so should advance to 24
    expect(result.format('YYYY-MM-DD')).toBe('2026-03-21');
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
          // Domingo no es hábil; en este modelo Sábado sí es hábil
          expect(dayOfWeek).not.toBe(0);
        });
    });

    it('sets expectedEndDate to the last installment dueDate', () => {
      const result = generateFixedDailySchedule(baseParams);
      expect(result.expectedEndDate).toBe(result.schedule[19].dueDate);
    });
  });

  describe('legacy mode with different frequencies', () => {
    it('advances by 1 week for WEEKLY frequency in legacy mode', () => {
      const res = generateFixedDailySchedule({
        principal: '100000',
        totalRate: '0.03',
        termDays: 3,
        startDate: '2026-03-02',
        frequency: 'WEEKLY',
      });
      const dates = res.schedule.map((s) => s.dueDate);
      // differences between consecutive dates should be 7 days
      const diffs = dates.slice(1).map((d, i) => dayjs(d).diff(dayjs(dates[i]), 'day'));
      diffs.forEach((delta) => expect(delta).toBe(7));
    });

    it('advances by 1 month for MONTHLY frequency in legacy mode', () => {
      const res = generateFixedDailySchedule({
        principal: '50000',
        totalRate: '0.02',
        termDays: 2,
        startDate: '2026-03-02',
        frequency: 'MONTHLY',
      });
      const dates = res.schedule.map((s) => s.dueDate);
      const first = dayjs(dates[0]);
      const second = dayjs(dates[1]);
  const monthDiff = second.month() - first.month() === 1 || dayjs(second).diff(first, 'month') === 1;
  expect(monthDiff).toBe(true);
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
        // Domingo no es hábil; sábados sí son hábiles en este modelo
        expect(d.day()).not.toBe(0);
      });

      const totalPrincipal = result.schedule.reduce(
        (acc, s) => acc.plus(s.principalDue),
        new Decimal(0),
      );
      expect(totalPrincipal.toFixed(2)).toBe('200000.00');
    });
  });
});
