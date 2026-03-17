import Decimal from 'decimal.js';
import prisma from '../config/prisma.js';
import { getDaysOverdue, calcMora } from '../engine/mora.js';

/**
 * @typedef {object} MoraUpdateResult
 * @property {string} loanId - UUID del préstamo actualizado
 * @property {string} moraAmount - Mora total calculada y guardada
 * @property {number} overdueSchedules - Número de cuotas vencidas procesadas
 */

/**
 * Calcula y actualiza la mora de un préstamo y de cada cuota vencida
 * dentro de una única transacción Prisma.
 *
 * Por cuota vencida e impaga:
 *  - Calcula la mora diaria sobre el saldo impago de esa cuota.
 *  - Persiste el valor en `paymentSchedule.moraCharged` para que la
 *    vista de detalle del préstamo pueda mostrarlo por fila.
 *
 * En el préstamo:
 *  - Acumula la suma de todas las moras y la persiste en `loan.moraAmount`.
 *
 * @param {string} loanId - UUID del préstamo a procesar
 * @returns {Promise<MoraUpdateResult>}
 */
export const calculateAndUpdateLoanMora = async (loanId) => {
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: loanId },
      select: {
        id: true,
        interestRate: true,
        paymentSchedule: {
          where: { isPaid: false },
          select: {
            id: true,
            dueDate: true,
            amountDue: true,
            amountPaid: true,
          },
        },
      },
    });

    const dailyRate = new Decimal(loan.interestRate);
    const today = new Date().toISOString().slice(0, 10);

    let totalMora = new Decimal(0);
    let overdueCount = 0;

    // Calcular mora por cuota y actualizar moraCharged en paralelo
    const scheduleUpdates = [];

    for (const schedule of loan.paymentSchedule) {
      const daysOverdue = getDaysOverdue(
        schedule.dueDate.toISOString().slice(0, 10),
        today,
      );

      // La mora se calcula sobre el saldo impago de la cuota
      const unpaidOnSchedule = new Decimal(schedule.amountDue).minus(
        new Decimal(schedule.amountPaid),
      );

      if (daysOverdue <= 0 || unpaidOnSchedule.lte(0)) {
        // Sin mora: limpiar moraCharged si la cuota ya no está vencida
        scheduleUpdates.push(
          tx.paymentSchedule.update({
            where: { id: schedule.id },
            data: { moraCharged: '0.00' },
          }),
        );
        continue;
      }

      const { moraAmount: schedMora } = calcMora({
        outstandingAmount: unpaidOnSchedule.toFixed(2),
        dailyRate: dailyRate.toFixed(8),
        daysOverdue,
      });

      totalMora = totalMora.plus(new Decimal(schedMora));
      overdueCount += 1;

      // Persistir mora calculada en la cuota para que la vista la muestre
      scheduleUpdates.push(
        tx.paymentSchedule.update({
          where: { id: schedule.id },
          data: { moraCharged: schedMora },
        }),
      );
    }

    await Promise.all(scheduleUpdates);

    const updatedLoan = await tx.loan.update({
      where: { id: loanId },
      data: { moraAmount: totalMora.toFixed(2) },
      select: { id: true, moraAmount: true },
    });

    return {
      loanId: updatedLoan.id,
      moraAmount: updatedLoan.moraAmount.toString(),
      overdueSchedules: overdueCount,
    };
  });
};

/**
 * Obtiene los IDs de todos los préstamos activos de una organización
 * que tienen al menos una cuota vencida e impaga.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<string[]>} Array de loanIds con mora pendiente
 */
export const findActiveLoansWithOverdueSchedules = async (organizationId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const loans = await prisma.loan.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      paymentSchedule: {
        some: {
          isPaid: false,
          dueDate: { lt: today },
        },
      },
    },
    select: { id: true },
  });

  return loans.map((l) => l.id);
};

/**
 * Procesa la mora de todos los préstamos activos con cuotas vencidas
 * de una organización. Diseñado para ser llamado desde el moraWorker.
 *
 * Procesa cada préstamo de forma individual para que un error en uno
 * no bloquee el resto del lote.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<{ processed: number, errors: number, totalMora: string }>}
 */
export const processMoraForOrganization = async (organizationId) => {
  const loanIds = await findActiveLoansWithOverdueSchedules(organizationId);

  let processed = 0;
  let errors = 0;
  let totalMora = new Decimal(0);

  for (const loanId of loanIds) {
    try {
      const result = await calculateAndUpdateLoanMora(loanId);
      totalMora = totalMora.plus(new Decimal(result.moraAmount));
      processed += 1;
    } catch (err) {
      // Un error en un préstamo no debe detener el procesamiento del lote
      console.error(`[MoraService] Error calculando mora para préstamo ${loanId}:`, err.message);
      errors += 1;
    }
  }

  return {
    processed,
    errors,
    totalMora: totalMora.toFixed(2),
  };
};
