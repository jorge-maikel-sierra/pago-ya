import Decimal from 'decimal.js';
import dayjs from 'dayjs';

/**
 * @typedef {object} ScheduleInstallment
 * @property {number} installmentNumber - Número secuencial de la cuota (1-based)
 * @property {string} dueDate - Fecha de vencimiento (ISO 8601: YYYY-MM-DD)
 * @property {string} amountDue - Monto total de la cuota (principal + interés)
 * @property {string} principalDue - Porción de capital en esta cuota
 * @property {string} interestDue - Porción de interés en esta cuota
 */

/**
 * @typedef {object} AmortizationResult
 * @property {ScheduleInstallment[]} schedule - Cronograma de cuotas generado
 * @property {string} totalAmount - Monto total a pagar (capital + intereses)
 * @property {string} totalInterest - Total de intereses cobrados
 * @property {string} installmentAmount - Monto fijo por cuota (antes del ajuste de la última)
 * @property {string} expectedEndDate - Fecha de la última cuota (ISO 8601: YYYY-MM-DD)
 */

/**
 * @typedef {object} FixedDailyParams
 * @property {string|number} principal - Monto del capital prestado
 * @property {string|number} totalRate - Tasa de interés TOTAL del préstamo (ej: 0.05 para 5% total)
 * @property {number} termDays - Número de cuotas (días hábiles de pago)
 * @property {string} startDate - Fecha de desembolso (YYYY-MM-DD).
 *   Primera cuota = siguiente día hábil
 * @property {string[]} [holidays] - Lista de fechas festivas (YYYY-MM-DD) a excluir
 */

/**
 * Determina si una fecha es día hábil (no fin de semana, no festivo).
 *
 * @param {dayjs.Dayjs} date - Fecha a evaluar
 * @param {Set<string>} holidaySet - Set de fechas festivas en formato YYYY-MM-DD
 * @returns {boolean} true si es día hábil
 */
const isBusinessDay = (date, holidaySet) => {
  const dayOfWeek = date.day();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !holidaySet.has(date.format('YYYY-MM-DD'));
};

/**
 * Obtiene el siguiente día hábil a partir de una fecha dada.
 *
 * @param {dayjs.Dayjs} date - Fecha de inicio
 * @param {Set<string>} holidaySet - Set de fechas festivas
 * @returns {dayjs.Dayjs} Siguiente día hábil
 */
const nextBusinessDay = (date, holidaySet) => {
  let next = date.add(1, 'day');
  while (!isBusinessDay(next, holidaySet)) {
    next = next.add(1, 'day');
  }
  return next;
};

/**
 * Genera un cronograma de amortización fija diaria (cuota fija).
 *
 * En este sistema de "cuota fija", el interés se calcula como porcentaje TOTAL
 * sobre el capital (interés simple), luego se divide en cuotas iguales.
 *
 * REGLAS:
 * - Usa exclusivamente Decimal.js para todos los cálculos monetarios.
 * - No accede a base de datos ni variables de entorno (función pura).
 * - Los días de pago son solo días hábiles (lun-vie, excluyendo festivos).
 *
 * @param {FixedDailyParams} params
 * @returns {AmortizationResult}
 * @throws {Error} Si los parámetros son inválidos
 */
const generateFixedDailySchedule = ({
  principal,
  totalRate,
  termDays,
  startDate,
  holidays = [],
}) => {
  const principalDec = new Decimal(principal);
  const rateDec = new Decimal(totalRate);
  const term = Number(termDays);

  if (principalDec.lte(0)) {
    throw new Error('El capital (principal) debe ser mayor a cero');
  }
  if (rateDec.lt(0)) {
    throw new Error('La tasa total (totalRate) no puede ser negativa');
  }
  if (!Number.isInteger(term) || term <= 0) {
    throw new Error('El plazo (termDays) debe ser un entero positivo');
  }
  if (!dayjs(startDate).isValid()) {
    throw new Error('La fecha de inicio (startDate) no es válida');
  }

  const holidaySet = new Set(holidays);

  // Interés simple: capital × tasa total (NO multiplicado por el plazo)
  const totalInterest = principalDec.mul(rateDec);
  const totalAmount = principalDec.plus(totalInterest);

  const installmentAmount = totalAmount.div(term).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const dailyInterest = totalInterest.div(term).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const dailyPrincipal = installmentAmount.minus(dailyInterest);

  const schedule = [];
  let currentDate = dayjs(startDate);
  let accumulatedPrincipal = new Decimal(0);
  let accumulatedInterest = new Decimal(0);

  for (let i = 1; i <= term; i += 1) {
    currentDate = nextBusinessDay(currentDate, holidaySet);

    const isLast = i === term;

    let cuotaPrincipal;
    let cuotaInterest;
    let cuotaAmount;

    if (isLast) {
      cuotaPrincipal = principalDec.minus(accumulatedPrincipal);
      cuotaInterest = totalInterest.minus(accumulatedInterest);
      cuotaAmount = cuotaPrincipal.plus(cuotaInterest);
    } else {
      cuotaPrincipal = dailyPrincipal;
      cuotaInterest = dailyInterest;
      cuotaAmount = installmentAmount;
    }

    accumulatedPrincipal = accumulatedPrincipal.plus(cuotaPrincipal);
    accumulatedInterest = accumulatedInterest.plus(cuotaInterest);

    schedule.push({
      installmentNumber: i,
      dueDate: currentDate.format('YYYY-MM-DD'),
      amountDue: cuotaAmount.toFixed(2),
      principalDue: cuotaPrincipal.toFixed(2),
      interestDue: cuotaInterest.toFixed(2),
    });
  }

  return {
    schedule,
    totalAmount: totalAmount.toFixed(2),
    totalInterest: totalInterest.toFixed(2),
    installmentAmount: installmentAmount.toFixed(2),
    expectedEndDate: schedule[schedule.length - 1].dueDate,
  };
};

export { generateFixedDailySchedule, isBusinessDay, nextBusinessDay };
