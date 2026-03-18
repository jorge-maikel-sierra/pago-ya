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
 * @property {number} numberOfPayments - Cuotas calculadas automáticamente
 */

/**
 * @typedef {object} LoanScheduleParams
 * @property {string|number} principal   - Capital prestado
 * @property {string|number} monthlyRate - Tasa de interés MENSUAL (ej: 0.10 = 10% por mes)
 * @property {number}        termMonths  - Plazo del préstamo en meses (ej: 1, 2, 3)
 * @property {string|Date}   startDate   - Fecha de desembolso (YYYY-MM-DD o Date)
 * @property {'DAILY'|'WEEKLY'|'BIWEEKLY'|'MONTHLY'} [frequency='DAILY'] - Frecuencia de pago
 * @property {string[]}      [holidays]  - Festivos YYYY-MM-DD (solo aplica a DAILY)
 */

/**
 * Determina si una fecha es día hábil (lun-sáb, no festivo).
 * Los sábados SÍ son laborables en el modelo de microcrédito diario colombiano.
 *
 * @param {dayjs.Dayjs} date
 * @param {Set<string>} holidaySet
 * @returns {boolean}
 */
const isBusinessDay = (date, holidaySet) => {
  // Solo el domingo (0) es excluido; los sábados cuentan como días de cobro
  if (date.day() === 0) return false;
  return !holidaySet.has(date.format('YYYY-MM-DD'));
};

/**
 * Avanza al siguiente día hábil (lun-sáb sin festivos).
 *
 * @param {dayjs.Dayjs} date
 * @param {Set<string>} holidaySet
 * @returns {dayjs.Dayjs}
 */
const nextBusinessDay = (date, holidaySet) => {
  let next = date.add(1, 'day');
  while (!isBusinessDay(next, holidaySet)) {
    next = next.add(1, 'day');
  }
  return next;
};

/**
 * Cuenta los días hábiles entre startDate (exclusive) y endDate (inclusive).
 *
 * @param {dayjs.Dayjs} startDate - Fecha de desembolso (no cuenta)
 * @param {dayjs.Dayjs} endDate   - Último día del plazo (cuenta si es hábil)
 * @param {Set<string>} holidaySet
 * @returns {number}
 */
const countBusinessDaysBetween = (startDate, endDate, holidaySet) => {
  let count = 0;
  let cursor = startDate.add(1, 'day');
  while (!cursor.isAfter(endDate)) {
    if (isBusinessDay(cursor, holidaySet)) count += 1;
    cursor = cursor.add(1, 'day');
  }
  return count;
};

/**
 * Calcula el número de cuotas según la frecuencia de pago y el plazo en meses.
 *
 * - DAILY:    días hábiles (lun-sáb sin festivos) dentro del plazo
 * - WEEKLY:   4 semanas por mes
 * - BIWEEKLY: 2 quincenas por mes
 * - MONTHLY:  1 cuota por mes
 *
 * @param {'DAILY'|'WEEKLY'|'BIWEEKLY'|'MONTHLY'} frequency
 * @param {number}      termMonths
 * @param {dayjs.Dayjs} startDate
 * @param {Set<string>} holidaySet
 * @returns {number}
 */
const calcNumberOfPayments = (frequency, termMonths, startDate, holidaySet) => {
  if (frequency === 'MONTHLY') return termMonths;
  if (frequency === 'BIWEEKLY') return termMonths * 2;
  if (frequency === 'WEEKLY') return termMonths * 4;
  // DAILY: días hábiles reales en el plazo
  const endDate = startDate.add(termMonths, 'month');
  return countBusinessDaysBetween(startDate, endDate, holidaySet);
};

/**
 * Genera un cronograma de amortización con cuota fija e interés simple.
 *
 * LÓGICA FINANCIERA:
 *   - El usuario ingresa el plazo en MESES y la tasa de interés MENSUAL.
 *   - El sistema calcula cuántas cuotas corresponden según la frecuencia.
 *   - Interés total = capital × tasa mensual × meses.
 *   - Cuota fija   = (capital + interés total) ÷ número de cuotas.
 *
 * Ejemplo: $3.000.000 al 10%/mes por 1 mes, DAILY (~26 días hábiles)
 *   → interés = 300.000 → total = 3.300.000 → cuota ≈ 126.923,08
 *
 * Ejemplo: $3.000.000 al 10%/mes por 2 meses, MONTHLY
 *   → interés = 600.000 → total = 3.600.000 → 2 cuotas de 1.800.000
 *
 * @param {LoanScheduleParams} params
 * @returns {AmortizationResult}
 * @throws {Error} Si los parámetros son inválidos
 */
const generateFixedDailySchedule = ({
  principal,
  monthlyRate,
  termMonths,
  startDate,
  frequency = 'DAILY',
  holidays = [],
  // Legacy compatibility: some callers/tests use totalRate + termDays
  totalRate,
  termDays,
}) => {
  const principalDec = new Decimal(principal);

  const holidaySet = new Set(holidays);
  const startDayjs = dayjs(startDate);

  // Modo legacy: si se pasa `totalRate` o `termDays`, tratamos esos valores como
  // tasa total y número de cuotas respectivamente (mantener compatibilidad con tests antiguos)
  const legacyMode = typeof totalRate !== 'undefined' || typeof termDays !== 'undefined';

  if (legacyMode) {
    // termDays: número de cuotas (entero positivo)
    const term = Number(termDays);
    if (!Number.isInteger(term) || term <= 0) {
      throw new Error('El plazo (termDays) debe ser un entero positivo');
    }

    const totalRateDec = new Decimal(totalRate);
    if (totalRateDec.lt(0)) {
      throw new Error('La tasa total (totalRate) no puede ser negativa');
    }

    if (principalDec.lte(0)) throw new Error('El capital (principal) debe ser mayor a cero');
    if (!dayjs(startDate).isValid()) throw new Error('La fecha de inicio (startDate) no es válida');

    const totalInterest = principalDec.mul(totalRateDec);
    const totalAmount = principalDec.plus(totalInterest);

    const rawInstallment = totalAmount.div(term);
    const installmentAmount = rawInstallment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const interestPerInstallment = totalInterest
      .div(term)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const principalPerInstallment = installmentAmount.minus(interestPerInstallment);

    const schedule = [];
    let currentDate = startDayjs;
    let accumulatedPrincipal = new Decimal(0);
    let accumulatedInterest = new Decimal(0);

    for (let i = 1; i <= term; i += 1) {
      if (frequency === 'DAILY') {
        currentDate = nextBusinessDay(currentDate, holidaySet);
      } else if (frequency === 'WEEKLY') {
        currentDate = currentDate.add(1, 'week');
      } else if (frequency === 'BIWEEKLY') {
        currentDate = currentDate.add(2, 'week');
      } else {
        currentDate = currentDate.add(1, 'month');
      }

      const isLast = i === term;
      let cuotaPrincipal;
      let cuotaInterest;
      let cuotaAmount;

      if (isLast) {
        cuotaPrincipal = principalDec.minus(accumulatedPrincipal);
        cuotaInterest = totalInterest.minus(accumulatedInterest);
        cuotaAmount = cuotaPrincipal.plus(cuotaInterest);
      } else {
        cuotaPrincipal = principalPerInstallment;
        cuotaInterest = interestPerInstallment;
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
      numberOfPayments: term,
    };
  }

  // Modo actual: monthlyRate y termMonths
  const rateDec = new Decimal(monthlyRate);
  const months = Number(termMonths);

  if (principalDec.lte(0)) throw new Error('El capital (principal) debe ser mayor a cero');
  if (rateDec.lt(0)) throw new Error('La tasa mensual (monthlyRate) no puede ser negativa');
  if (!Number.isInteger(months) || months <= 0) throw new Error('El plazo (termMonths) debe ser un entero positivo');
  if (!dayjs(startDate).isValid()) throw new Error('La fecha de inicio (startDate) no es válida');

  // Interés total = capital × tasa mensual × número de meses
  const totalInterest = principalDec.mul(rateDec).mul(months);
  const totalAmount = principalDec.plus(totalInterest);

  // Número de cuotas calculado automáticamente según la frecuencia y el plazo
  const term = calcNumberOfPayments(frequency, months, startDayjs, holidaySet);
  if (term <= 0) throw new Error('No se encontraron días de pago en el plazo indicado');

  const installmentAmount = totalAmount.div(term).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const interestPerInstallment = totalInterest.div(term).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const principalPerInstallment = installmentAmount.minus(interestPerInstallment);

  const schedule = [];
  let currentDate = startDayjs;
  let accumulatedPrincipal = new Decimal(0);
  let accumulatedInterest = new Decimal(0);

  for (let i = 1; i <= term; i += 1) {
    if (frequency === 'DAILY') {
      currentDate = nextBusinessDay(currentDate, holidaySet);
    } else if (frequency === 'WEEKLY') {
      currentDate = currentDate.add(1, 'week');
    } else if (frequency === 'BIWEEKLY') {
      currentDate = currentDate.add(2, 'week');
    } else {
      currentDate = currentDate.add(1, 'month');
    }

    const isLast = i === term;
    let cuotaPrincipal;
    let cuotaInterest;
    let cuotaAmount;

    if (isLast) {
      // La última cuota absorbe el redondeo acumulado para que el total sea exacto
      cuotaPrincipal = principalDec.minus(accumulatedPrincipal);
      cuotaInterest = totalInterest.minus(accumulatedInterest);
      cuotaAmount = cuotaPrincipal.plus(cuotaInterest);
    } else {
      cuotaPrincipal = principalPerInstallment;
      cuotaInterest = interestPerInstallment;
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
    numberOfPayments: term,
  };
};

export { generateFixedDailySchedule, isBusinessDay, nextBusinessDay, calcNumberOfPayments };
