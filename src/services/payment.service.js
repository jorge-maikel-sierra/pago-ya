import Decimal from 'decimal.js';
import prisma from '../config/prisma.js';

/**
 * @typedef {object} RegisterPaymentInput
 * @property {string} loanId
 * @property {number} amountPaid
 * @property {string} offlineCreatedAt - ISO 8601
 * @property {string} collectorId
 * @property {string} [paymentScheduleId]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [notes]
 */

/**
 * @typedef {object} PaymentResult
 * @property {object} payment - Registro creado en la tabla payments
 * @property {object} loan - Préstamo actualizado
 * @property {object} [schedule] - Cuota del cronograma actualizada (si aplica)
 */

/**
 * Registra un pago individual dentro de una transacción Prisma.
 * 1. Valida que el préstamo exista y esté activo.
 * 2. Encuentra la cuota pendiente más antigua (si no se provee paymentScheduleId).
 * 3. Crea el registro Payment.
 * 4. Actualiza la cuota del cronograma (amountPaid, isPaid, paidAt).
 * 5. Actualiza los totales del préstamo (totalPaid, outstandingBalance, paidPayments, status).
 *
 * @param {RegisterPaymentInput} input
 * @param {import('@prisma/client').PrismaClient} [tx] - Prisma transaction client (opcional)
 * @returns {Promise<PaymentResult>}
 * @throws {Error} Si el préstamo no existe, no está activo o no hay cuotas pendientes
 */
const processPayment = async (input, tx) => {
  const db = tx || prisma;

  const {
    loanId,
    amountPaid,
    offlineCreatedAt,
    collectorId,
    paymentScheduleId,
    latitude,
    longitude,
    notes,
  } = input;

  const amount = new Decimal(amountPaid);

  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: {
      client: { select: { firstName: true, lastName: true, phone: true } },
    },
  });

  if (!loan) {
    const err = new Error('Préstamo no encontrado');
    err.statusCode = 404;
    err.isOperational = true;
    throw err;
  }

  if (loan.status !== 'ACTIVE') {
    const err = new Error(`El préstamo no está activo (estado actual: ${loan.status})`);
    err.statusCode = 409;
    err.isOperational = true;
    throw err;
  }

  let schedule;

  if (paymentScheduleId) {
    schedule = await db.paymentSchedule.findUnique({
      where: { id: paymentScheduleId },
    });

    if (!schedule || schedule.loanId !== loanId) {
      const err = new Error('Cuota del cronograma no encontrada para este préstamo');
      err.statusCode = 404;
      err.isOperational = true;
      throw err;
    }
  } else {
    schedule = await db.paymentSchedule.findFirst({
      where: { loanId, isPaid: false },
      orderBy: { dueDate: 'asc' },
    });
  }

  const moraAmount = new Decimal(0);
  const totalReceived = amount.plus(moraAmount);

  const payment = await db.payment.create({
    data: {
      loanId,
      paymentScheduleId: schedule?.id,
      collectorId,
      amount: amount.toFixed(2),
      moraAmount: moraAmount.toFixed(2),
      totalReceived: totalReceived.toFixed(2),
      latitude,
      longitude,
      notes,
      collectedAt: new Date(offlineCreatedAt),
    },
  });

  let updatedSchedule;

  if (schedule) {
    const newAmountPaid = new Decimal(schedule.amountPaid).plus(amount);
    const amountDue = new Decimal(schedule.amountDue);
    const isPaid = newAmountPaid.gte(amountDue);

    updatedSchedule = await db.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        amountPaid: newAmountPaid.toFixed(2),
        isPaid,
        ...(isPaid && { paidAt: new Date(offlineCreatedAt) }),
      },
    });
  }

  const newTotalPaid = new Decimal(loan.totalPaid).plus(amount);
  const newOutstanding = new Decimal(loan.totalAmount).minus(newTotalPaid);
  const paidSchedules = await db.paymentSchedule.count({
    where: { loanId, isPaid: true },
  });
  const isCompleted = newOutstanding.lte(0);

  const updatedLoan = await db.loan.update({
    where: { id: loanId },
    data: {
      totalPaid: newTotalPaid.toFixed(2),
      outstandingBalance: Decimal.max(newOutstanding, new Decimal(0)).toFixed(2),
      paidPayments: paidSchedules,
      ...(isCompleted && {
        status: 'COMPLETED',
        actualEndDate: new Date(offlineCreatedAt),
      }),
    },
  });

  return {
    payment,
    loan: updatedLoan,
    schedule: updatedSchedule,
    clientName: `${loan.client.firstName} ${loan.client.lastName}`,
    clientPhone: loan.client.phone,
    numberOfPayments: loan.numberOfPayments,
  };
};

/**
 * Registra un pago individual envuelto en una transacción Prisma.
 *
 * @param {RegisterPaymentInput} input
 * @returns {Promise<PaymentResult>}
 */
const registerPayment = async (input) =>
  prisma.$transaction(async (tx) => processPayment(input, tx), { timeout: 10000 });

/**
 * @typedef {object} BatchSyncItem
 * @property {string} localId - ID local del dispositivo
 * @property {string} loanId
 * @property {number} amountPaid
 * @property {string} offlineCreatedAt
 * @property {string} [paymentScheduleId]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [notes]
 */

/**
 * @typedef {object} BatchSyncResult
 * @property {string} localId
 * @property {'synced'|'conflict'|'error'} status
 * @property {string} [paymentId] - UUID del pago creado (si synced)
 * @property {string} [message] - Mensaje descriptivo (si conflict o error)
 */

/**
 * Procesa un array de pagos registrados offline.
 * Cada pago se ejecuta en su propia transacción para que un fallo
 * individual no afecte al resto del lote.
 *
 * @param {BatchSyncItem[]} payments
 * @param {string} collectorId
 * @returns {Promise<BatchSyncResult[]>}
 */
const batchSync = async (payments, collectorId) => {
  const results = [];

  // Sequential processing is intentional: each payment in its own transaction
  // eslint-disable-next-line no-restricted-syntax
  for (const item of payments) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await registerPayment({
        ...item,
        collectorId,
      });

      results.push({
        localId: item.localId,
        status: 'synced',
        paymentId: result.payment.id,
      });
    } catch (err) {
      const isConflict = err.statusCode === 409 || err.code === 'P2002';

      results.push({
        localId: item.localId,
        status: isConflict ? 'conflict' : 'error',
        message: err.message,
      });
    }
  }

  return results;
};

export { processPayment, registerPayment, batchSync };
