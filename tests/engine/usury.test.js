import { describe, it, expect } from '@jest/globals';
import {
  dailyToEffectiveAnnual,
  monthlyToEffectiveAnnual,
  isRateLegal,
} from '../../src/engine/usury.js';

// ============================================
// dailyToEffectiveAnnual
// ============================================

describe('dailyToEffectiveAnnual', () => {
  describe('known conversions', () => {
    it('converts 0.0033 daily to ~233.59% EA', () => {
      const ea = dailyToEffectiveAnnual('0.0033');
      // (1.0033)^365 - 1 ≈ 2.3282 → 232.82%
      expect(Number(ea)).toBeGreaterThan(230);
      expect(Number(ea)).toBeLessThan(240);
    });

    it('converts 0.001 daily to ~44.03% EA', () => {
      const ea = dailyToEffectiveAnnual('0.001');
      // (1.001)^365 - 1 ≈ 0.4403 → 44.03%
      expect(Number(ea)).toBeCloseTo(44.025, 0);
    });

    it('converts 0.0001 daily to ~3.72% EA', () => {
      const ea = dailyToEffectiveAnnual('0.0001');
      // (1.0001)^365 - 1 ≈ 0.03715 → 3.72%
      expect(Number(ea)).toBeCloseTo(3.715, 0);
    });

    it('converts 0.05 daily to very high EA', () => {
      const ea = dailyToEffectiveAnnual('0.05');
      expect(Number(ea)).toBeGreaterThan(1000);
    });
  });

  describe('edge cases', () => {
    it('returns "0.0000" for zero rate', () => {
      expect(dailyToEffectiveAnnual('0')).toBe('0.0000');
      expect(dailyToEffectiveAnnual(0)).toBe('0.0000');
    });

    it('returns result as a string with 4 decimals', () => {
      const ea = dailyToEffectiveAnnual('0.001');
      expect(typeof ea).toBe('string');
      expect(ea).toMatch(/^\d+\.\d{4}$/);
    });

    it('accepts numeric input', () => {
      const ea = dailyToEffectiveAnnual(0.001);
      expect(Number(ea)).toBeCloseTo(44.025, 0);
    });
  });

  describe('validation', () => {
    it('throws for negative rate', () => {
      expect(() => dailyToEffectiveAnnual('-0.001')).toThrow(
        'La tasa diaria (dailyRate) no puede ser negativa',
      );
    });
  });
});

// ============================================
// monthlyToEffectiveAnnual
// ============================================

describe('monthlyToEffectiveAnnual', () => {
  describe('known conversions', () => {
    it('converts 0.01 monthly (1%) to ~12.68% EA', () => {
      const ea = monthlyToEffectiveAnnual('0.01');
      // (1.01)^12 - 1 ≈ 0.1268 → 12.68%
      expect(Number(ea)).toBeCloseTo(12.6825, 1);
    });

    it('converts 0.02 monthly (2%) to ~26.82% EA', () => {
      const ea = monthlyToEffectiveAnnual('0.02');
      // (1.02)^12 - 1 ≈ 0.2682 → 26.82%
      expect(Number(ea)).toBeCloseTo(26.824, 1);
    });

    it('converts 0.021 monthly (2.1%) to ~28.32% EA', () => {
      const ea = monthlyToEffectiveAnnual('0.021');
      expect(Number(ea)).toBeCloseTo(28.32, 0);
    });
  });

  describe('edge cases', () => {
    it('returns "0.0000" for zero rate', () => {
      expect(monthlyToEffectiveAnnual('0')).toBe('0.0000');
    });

    it('returns string with 4 decimals', () => {
      const ea = monthlyToEffectiveAnnual('0.01');
      expect(typeof ea).toBe('string');
      expect(ea).toMatch(/^\d+\.\d{4}$/);
    });
  });

  describe('validation', () => {
    it('throws for negative rate', () => {
      expect(() => monthlyToEffectiveAnnual('-0.01')).toThrow(
        'La tasa mensual (monthlyRate) no puede ser negativa',
      );
    });
  });
});

// ============================================
// isRateLegal
// ============================================

describe('isRateLegal', () => {
  describe('legal rate scenarios', () => {
    it('declares a low daily rate as legal', () => {
      // 0.0005 daily ≈ 20% EA, usury monthly 0.021 ≈ 28.32% EA → legal
      const result = isRateLegal('0.0005', '0.021');
      expect(result.legal).toBe(true);
    });

    it('declares 0 daily rate as legal', () => {
      const result = isRateLegal('0', '0.021');
      expect(result.legal).toBe(true);
      expect(result.effectiveAnnualRate).toBe('0.0000');
    });
  });

  describe('illegal rate scenarios', () => {
    it('declares a high daily rate as illegal', () => {
      // 0.0033 daily ≈ 232% EA, usury monthly 0.021 ≈ 28.32% EA → illegal
      const result = isRateLegal('0.0033', '0.021');
      expect(result.legal).toBe(false);
      expect(Number(result.effectiveAnnualRate)).toBeGreaterThan(Number(result.usuryLimitAnnual));
    });

    it('declares 0.001 daily as illegal against 0.003 monthly usury', () => {
      // 0.001 daily ≈ 44% EA, 0.003 monthly ≈ 3.66% EA → illegal
      const result = isRateLegal('0.001', '0.003');
      expect(result.legal).toBe(false);
    });
  });

  describe('boundary scenarios', () => {
    it('handles rate just below the usury limit', () => {
      // 0.000683 daily → EA slightly below 28.32% (usury at 0.021 monthly ≈ 28.32% EA)
      const result = isRateLegal('0.000683', '0.021');
      expect(result.legal).toBe(true);
    });

    it('handles rate just above the usury limit', () => {
      // 0.0007 daily → EA ≈ 29.14% > 28.32% → illegal
      const result = isRateLegal('0.0007', '0.021');
      expect(result.legal).toBe(false);
    });
  });

  describe('result structure', () => {
    it('returns all expected fields', () => {
      const result = isRateLegal('0.001', '0.021');

      expect(result).toHaveProperty('legal');
      expect(result).toHaveProperty('effectiveAnnualRate');
      expect(result).toHaveProperty('usuryLimit');
      expect(result).toHaveProperty('usuryLimitAnnual');
      expect(typeof result.legal).toBe('boolean');
      expect(typeof result.effectiveAnnualRate).toBe('string');
      expect(typeof result.usuryLimit).toBe('string');
      expect(typeof result.usuryLimitAnnual).toBe('string');
    });

    it('returns usury limit as monthly percentage', () => {
      const result = isRateLegal('0.001', '0.021');
      expect(result.usuryLimit).toBe('2.1000');
    });

    it('returns EA values as strings with 4 decimals', () => {
      const result = isRateLegal('0.001', '0.021');
      expect(result.effectiveAnnualRate).toMatch(/^\d+\.\d{4}$/);
      expect(result.usuryLimitAnnual).toMatch(/^\d+\.\d{4}$/);
    });
  });

  describe('validation', () => {
    it('throws for negative dailyRate', () => {
      expect(() => isRateLegal('-0.001', '0.021')).toThrow(
        'La tasa diaria (dailyRate) no puede ser negativa',
      );
    });

    it('throws for negative usury rate', () => {
      expect(() => isRateLegal('0.001', '-0.021')).toThrow(
        'La tasa de usura mensual (usuryRateMonthly) no puede ser negativa',
      );
    });

    it('throws for zero usury rate', () => {
      expect(() => isRateLegal('0.001', '0')).toThrow(
        'La tasa de usura mensual (usuryRateMonthly) debe ser mayor a cero',
      );
    });
  });

  describe('Colombian regulatory scenario', () => {
    it('validates against real-world usury rate of 2.0225% monthly (Feb 2026)', () => {
      // Tasa de usura mensual vigente ~2.0225%
      // Un préstamo diario a 0.0005 daily → ~20% EA, límite ~27.2% EA → legal
      const result = isRateLegal('0.0005', '0.020225');
      expect(result.legal).toBe(true);

      // Un préstamo diario a 0.0033 daily → ~232% EA → claramente ilegal
      const illegal = isRateLegal('0.0033', '0.020225');
      expect(illegal.legal).toBe(false);
    });
  });
});
