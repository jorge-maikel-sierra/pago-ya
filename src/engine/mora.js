import Decimal from 'decimal.js';
import dayjs from 'dayjs';

/**
 * @typedef {object} MoraParams
 * @property {string|number} outstandingAmount - Saldo vencido (cuota o monto impago)
 * @property {string|number} dailyRate - Tasa de interés diaria base del préstamo (ej: 0.0033)
 * @property {number} daysOverdue - Días de mora efectivos (ya descontada la gracia)
 * @property {number} [multiplier=1.5] - Factor multiplicador sobre la tasa diaria para mora
 */

/**
 * @typedef {object} MoraResult
 * @property {string} moraAmount - Monto total de recargo por mora
 * @property {string} moraRate - Tasa diaria de mora aplicada (dailyRate × multiplier)
 * @property {number} daysCharged - Días efectivos de mora cobrados
 */

/**
 * Calcula los días de mora de una cuota vencida, descontando el período de gracia.
 *
 * @param {string} dueDate - Fecha de vencimiento de la cuota (YYYY-MM-DD)
 * @param {string} [referenceDate] - Fecha de referencia para el cálculo
 *   (YYYY-MM-DD). Por defecto hoy.
 * @param {number} [graceDays=0] - Días de gracia antes de aplicar mora
 * @returns {number} Días de mora (≥ 0). Retorna 0 si aún está dentro del período de gracia.
 * @throws {Error} Si los parámetros son inválidos
 */
const getDaysOverdue = (dueDate, referenceDate, graceDays = 0) => {
  const due = dayjs(dueDate);
  if (!due.isValid()) {
    throw new Error('La fecha de vencimiento (dueDate) no es válida');
  }

  const grace = Number(graceDays);
  if (!Number.isInteger(grace) || grace < 0) {
    throw new Error('Los días de gracia (graceDays) deben ser un entero >= 0');
  }

  const ref = referenceDate !== undefined ? dayjs(referenceDate) : dayjs();
  if (!ref.isValid()) {
    throw new Error('La fecha de referencia (referenceDate) no es válida');
  }

  const calendarDays = ref.startOf('day').diff(due.startOf('day'), 'day');

  const overdue = calendarDays - grace;
  return overdue > 0 ? overdue : 0;
};

/**
 * Calcula el recargo por mora sobre un monto vencido.
 *
 * La mora se calcula como: outstandingAmount × (dailyRate × multiplier) × daysOverdue
 * Donde el multiplier permite aplicar un factor de recargo sobre la tasa base
 * (por ejemplo, 1.5× la tasa ordinaria como es práctica común en Colombia).
 *
 * @param {MoraParams} params
 * @returns {MoraResult}
 * @throws {Error} Si los parámetros son inválidos
 */
const calcMora = ({ outstandingAmount, dailyRate, daysOverdue, multiplier = 1.5 }) => {
  const amount = new Decimal(outstandingAmount);
  const rate = new Decimal(dailyRate);
  const days = Number(daysOverdue);
  const mult = new Decimal(multiplier);

  if (amount.lt(0)) {
    throw new Error('El monto vencido (outstandingAmount) no puede ser negativo');
  }
  if (rate.lt(0)) {
    throw new Error('La tasa diaria (dailyRate) no puede ser negativa');
  }
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('Los días de mora (daysOverdue) deben ser un entero >= 0');
  }
  if (mult.lte(0)) {
    throw new Error('El multiplicador (multiplier) debe ser mayor a cero');
  }

  if (days === 0 || amount.isZero()) {
    return {
      moraAmount: '0.00',
      moraRate: rate.mul(mult).toFixed(6),
      daysCharged: 0,
    };
  }

  const moraRate = rate.mul(mult);
  const moraAmount = amount.mul(moraRate).mul(days).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    moraAmount: moraAmount.toFixed(2),
    moraRate: moraRate.toFixed(6),
    daysCharged: days,
  };
};

export { getDaysOverdue, calcMora };
