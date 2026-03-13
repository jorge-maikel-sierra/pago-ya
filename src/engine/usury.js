import Decimal from 'decimal.js';

/**
 * @typedef {object} LegalityResult
 * @property {boolean} legal - true si la tasa está dentro del límite legal
 * @property {string} effectiveAnnualRate - Tasa Efectiva Anual equivalente
 *   (porcentaje, ej: "28.12")
 * @property {string} usuryLimit - Límite de usura mensual recibido (porcentaje)
 * @property {string} usuryLimitAnnual - Límite de usura convertido a EA (porcentaje)
 */

/**
 * Convierte una tasa de interés diaria a Tasa Efectiva Anual (EA).
 *
 * Fórmula: EA = ((1 + dailyRate)^365 - 1) × 100
 *
 * @param {string|number} dailyRate - Tasa de interés diaria como decimal (ej: 0.0033 para 0.33%)
 * @returns {string} Tasa Efectiva Anual como porcentaje con 4 decimales (ej: "233.5872")
 * @throws {Error} Si la tasa es negativa
 */
const dailyToEffectiveAnnual = (dailyRate) => {
  const rate = new Decimal(dailyRate);

  if (rate.lt(0)) {
    throw new Error('La tasa diaria (dailyRate) no puede ser negativa');
  }

  if (rate.isZero()) {
    return '0.0000';
  }

  const ea = new Decimal(1).plus(rate).pow(365).minus(1).mul(100);

  return ea.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
};

/**
 * Convierte una tasa de interés mensual a Tasa Efectiva Anual (EA).
 *
 * Fórmula: EA = ((1 + monthlyRate)^12 - 1) × 100
 *
 * @param {string|number} monthlyRate - Tasa mensual como decimal (ej: 0.021 para 2.1%)
 * @returns {string} Tasa Efectiva Anual como porcentaje con 4 decimales
 */
const monthlyToEffectiveAnnual = (monthlyRate) => {
  const rate = new Decimal(monthlyRate);

  if (rate.lt(0)) {
    throw new Error('La tasa mensual (monthlyRate) no puede ser negativa');
  }

  if (rate.isZero()) {
    return '0.0000';
  }

  const ea = new Decimal(1).plus(rate).pow(12).minus(1).mul(100);

  return ea.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
};

/**
 * Valida si una tasa de interés diaria es legal según los límites de usura colombianos.
 *
 * La Superintendencia Financiera de Colombia publica el límite de usura como
 * una tasa mensual. Esta función convierte tanto la tasa diaria del préstamo
 * como el límite mensual a Tasa Efectiva Anual (EA) para compararlas en
 * la misma base.
 *
 * @param {string|number} dailyRate - Tasa de interés diaria como decimal (ej: 0.0033)
 * @param {string|number} usuryRateMonthly - Tasa de usura mensual como decimal
 *   (ej: 0.021 para 2.1%)
 * @returns {LegalityResult}
 * @throws {Error} Si los parámetros son inválidos
 */
const isRateLegal = (dailyRate, usuryRateMonthly) => {
  const daily = new Decimal(dailyRate);
  const monthly = new Decimal(usuryRateMonthly);

  if (daily.lt(0)) {
    throw new Error('La tasa diaria (dailyRate) no puede ser negativa');
  }
  if (monthly.lt(0)) {
    throw new Error('La tasa de usura mensual (usuryRateMonthly) no puede ser negativa');
  }
  if (monthly.isZero()) {
    throw new Error('La tasa de usura mensual (usuryRateMonthly) debe ser mayor a cero');
  }

  const effectiveAnnualRate = dailyToEffectiveAnnual(dailyRate);
  const usuryLimitAnnual = monthlyToEffectiveAnnual(usuryRateMonthly);

  const eaDec = new Decimal(effectiveAnnualRate);
  const limitDec = new Decimal(usuryLimitAnnual);

  return {
    legal: eaDec.lte(limitDec),
    effectiveAnnualRate,
    usuryLimit: new Decimal(usuryRateMonthly).mul(100).toFixed(4),
    usuryLimitAnnual,
  };
};

export { dailyToEffectiveAnnual, monthlyToEffectiveAnnual, isRateLegal };
