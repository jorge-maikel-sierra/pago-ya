import { describe, it, expect } from '@jest/globals';
import { getDaysOverdue, calcMora } from '../../src/engine/mora.js';

// ============================================
// getDaysOverdue
// ============================================

describe('getDaysOverdue', () => {
  describe('basic overdue calculation', () => {
    it('returns 0 when referenceDate equals dueDate', () => {
      expect(getDaysOverdue('2026-01-15', '2026-01-15')).toBe(0);
    });

    it('returns 0 when referenceDate is before dueDate', () => {
      expect(getDaysOverdue('2026-01-20', '2026-01-15')).toBe(0);
    });

    it('returns correct days when overdue without grace', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-15')).toBe(5);
    });

    it('returns 1 day overdue for next-day reference', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-11')).toBe(1);
    });

    it('handles large overdue periods', () => {
      expect(getDaysOverdue('2025-01-01', '2026-01-01')).toBe(365);
    });
  });

  describe('grace period', () => {
    it('returns 0 when within grace period', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-13', 5)).toBe(0);
    });

    it('returns 0 on the exact last day of grace', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-15', 5)).toBe(0);
    });

    it('returns 1 day overdue on the day after grace ends', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-16', 5)).toBe(1);
    });

    it('returns correct days minus grace period', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-20', 3)).toBe(7);
    });

    it('handles graceDays = 0 (default)', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-15')).toBe(5);
    });

    it('returns 0 when grace period exceeds calendar days', () => {
      expect(getDaysOverdue('2026-01-10', '2026-01-12', 10)).toBe(0);
    });
  });

  describe('validation', () => {
    it('throws for invalid dueDate', () => {
      expect(() => getDaysOverdue('invalid', '2026-01-15')).toThrow(
        'La fecha de vencimiento (dueDate) no es válida',
      );
    });

    it('throws for invalid referenceDate', () => {
      expect(() => getDaysOverdue('2026-01-10', 'invalid')).toThrow(
        'La fecha de referencia (referenceDate) no es válida',
      );
    });

    it('throws for negative graceDays', () => {
      expect(() => getDaysOverdue('2026-01-10', '2026-01-15', -1)).toThrow(
        'Los días de gracia (graceDays) deben ser un entero >= 0',
      );
    });

    it('throws for non-integer graceDays', () => {
      expect(() => getDaysOverdue('2026-01-10', '2026-01-15', 2.5)).toThrow(
        'Los días de gracia (graceDays) deben ser un entero >= 0',
      );
    });
  });

  describe('defaults', () => {
    it('uses today as referenceDate when not provided', () => {
      const pastDate = '2020-01-01';
      const result = getDaysOverdue(pastDate);
      expect(result).toBeGreaterThan(0);
    });

    it('uses 0 as graceDays when not provided', () => {
      const result = getDaysOverdue('2026-01-10', '2026-01-15');
      expect(result).toBe(5);
    });
  });
});

// ============================================
// calcMora
// ============================================

describe('calcMora', () => {
  describe('basic mora calculation', () => {
    it('calculates mora with default multiplier (1.5)', () => {
      const result = calcMora({
        outstandingAmount: '10000',
        dailyRate: '0.0033',
        daysOverdue: 10,
      });

      // mora = 10000 × (0.0033 × 1.5) × 10 = 10000 × 0.00495 × 10 = 495.00
      expect(result.moraAmount).toBe('495.00');
      expect(result.moraRate).toBe('0.004950');
      expect(result.daysCharged).toBe(10);
    });

    it('calculates mora with custom multiplier', () => {
      const result = calcMora({
        outstandingAmount: '50000',
        dailyRate: '0.002',
        daysOverdue: 5,
        multiplier: 2,
      });

      // mora = 50000 × (0.002 × 2) × 5 = 50000 × 0.004 × 5 = 1000.00
      expect(result.moraAmount).toBe('1000.00');
      expect(result.moraRate).toBe('0.004000');
      expect(result.daysCharged).toBe(5);
    });

    it('calculates mora for a single day', () => {
      const result = calcMora({
        outstandingAmount: '200000',
        dailyRate: '0.0033',
        daysOverdue: 1,
      });

      // mora = 200000 × 0.00495 × 1 = 990.00
      expect(result.moraAmount).toBe('990.00');
      expect(result.moraRate).toBe('0.004950');
      expect(result.daysCharged).toBe(1);
    });

    it('handles multiplier of exactly 1 (no surcharge)', () => {
      const result = calcMora({
        outstandingAmount: '10000',
        dailyRate: '0.0033',
        daysOverdue: 10,
        multiplier: 1,
      });

      // mora = 10000 × 0.0033 × 10 = 330.00
      expect(result.moraAmount).toBe('330.00');
      expect(result.moraRate).toBe('0.003300');
      expect(result.daysCharged).toBe(10);
    });
  });

  describe('zero/edge cases', () => {
    it('returns zero mora when daysOverdue is 0', () => {
      const result = calcMora({
        outstandingAmount: '10000',
        dailyRate: '0.0033',
        daysOverdue: 0,
      });

      expect(result.moraAmount).toBe('0.00');
      expect(result.daysCharged).toBe(0);
    });

    it('returns zero mora when outstandingAmount is 0', () => {
      const result = calcMora({
        outstandingAmount: '0',
        dailyRate: '0.0033',
        daysOverdue: 10,
      });

      expect(result.moraAmount).toBe('0.00');
      expect(result.daysCharged).toBe(0);
    });

    it('returns zero mora when dailyRate is 0', () => {
      const result = calcMora({
        outstandingAmount: '10000',
        dailyRate: '0',
        daysOverdue: 10,
      });

      expect(result.moraAmount).toBe('0.00');
      expect(result.moraRate).toBe('0.000000');
      expect(result.daysCharged).toBe(10);
    });
  });

  describe('decimal precision', () => {
    it('rounds correctly to 2 decimal places', () => {
      const result = calcMora({
        outstandingAmount: '33333',
        dailyRate: '0.0033',
        daysOverdue: 7,
      });

      // mora = 33333 × 0.00495 × 7 = 33333 × 0.034650 = 1154.98845 → 1154.99 (ROUND_HALF_UP)
      expect(result.moraAmount).toBe('1154.99');
    });

    it('rounds up at exactly 0.005', () => {
      const result = calcMora({
        outstandingAmount: '100000',
        dailyRate: '0.001',
        daysOverdue: 1,
        multiplier: 1,
      });

      // mora = 100000 × 0.001 × 1 = 100.00
      expect(result.moraAmount).toBe('100.00');
    });
  });

  describe('Colombian micro-loan scenario', () => {
    it('calculates realistic mora for $200,000 COP loan', () => {
      const result = calcMora({
        outstandingAmount: '200000',
        dailyRate: '0.0033',
        daysOverdue: 15,
      });

      // mora = 200000 × 0.00495 × 15 = 14850.00
      expect(result.moraAmount).toBe('14850.00');
      expect(result.moraRate).toBe('0.004950');
      expect(result.daysCharged).toBe(15);
    });
  });

  describe('validation', () => {
    it('throws for negative outstandingAmount', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '-1000',
          dailyRate: '0.0033',
          daysOverdue: 5,
        }),
      ).toThrow('El monto vencido (outstandingAmount) no puede ser negativo');
    });

    it('throws for negative dailyRate', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '10000',
          dailyRate: '-0.001',
          daysOverdue: 5,
        }),
      ).toThrow('La tasa diaria (dailyRate) no puede ser negativa');
    });

    it('throws for negative daysOverdue', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '10000',
          dailyRate: '0.0033',
          daysOverdue: -1,
        }),
      ).toThrow('Los días de mora (daysOverdue) deben ser un entero >= 0');
    });

    it('throws for non-integer daysOverdue', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '10000',
          dailyRate: '0.0033',
          daysOverdue: 3.5,
        }),
      ).toThrow('Los días de mora (daysOverdue) deben ser un entero >= 0');
    });

    it('throws for multiplier <= 0', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '10000',
          dailyRate: '0.0033',
          daysOverdue: 5,
          multiplier: 0,
        }),
      ).toThrow('El multiplicador (multiplier) debe ser mayor a cero');
    });

    it('throws for negative multiplier', () => {
      expect(() =>
        calcMora({
          outstandingAmount: '10000',
          dailyRate: '0.0033',
          daysOverdue: 5,
          multiplier: -1,
        }),
      ).toThrow('El multiplicador (multiplier) debe ser mayor a cero');
    });
  });
});
