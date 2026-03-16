import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { registerPayment, batchSync } from '../services/payment.service.js';
import { enqueuePaymentReceipt } from '../services/notification.service.js';

/**
 * POST /api/v1/payments
 * Registra un pago individual y encola el recibo de Telegram.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const registerPaymentHandler = asyncHandler(async (req, res) => {
  const result = await registerPayment({
    ...req.body,
    collectorId: req.user.id,
  });

  // Delegar el encolado al service — el controller no instancia colas directamente
  await enqueuePaymentReceipt({
    paymentId: result.payment.id,
    chatId: process.env.TELEGRAM_CHAT_ID,
    clientName: result.clientName,
    amount: result.payment.amount,
    moraAmount: result.payment.moraAmount,
    totalReceived: result.payment.totalReceived,
    outstandingBalance: result.loan.outstandingBalance,
    installmentNumber: result.loan.paidPayments,
    totalInstallments: result.numberOfPayments,
    collectorName: `${req.user.firstName} ${req.user.lastName}`,
    collectedAt: result.payment.collectedAt.toISOString(),
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('payment:created', {
      paymentId: result.payment.id,
      loanId: result.loan.id,
      amount: result.payment.amount,
      outstandingBalance: result.loan.outstandingBalance,
      status: result.loan.status,
    });
  }

  return success(
    res,
    {
      payment: result.payment,
      loan: {
        id: result.loan.id,
        totalPaid: result.loan.totalPaid,
        outstandingBalance: result.loan.outstandingBalance,
        paidPayments: result.loan.paidPayments,
        status: result.loan.status,
      },
    },
    'Pago registrado exitosamente',
    201,
  );
});

/**
 * POST /api/v1/payments/batch-sync
 * Procesa un array de pagos registrados offline.
 * Retorna un estado por ítem: synced, conflict o error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const batchSyncHandler = asyncHandler(async (req, res) => {
  const { payments } = req.body;

  const results = await batchSync(payments, req.user.id);

  const synced = results.filter((r) => r.status === 'synced');

  // Encolar recibos en lote — el service decide si Redis está disponible
  await Promise.all(
    synced.map((item) =>
      enqueuePaymentReceipt({
        paymentId: item.paymentId,
        chatId: process.env.TELEGRAM_CHAT_ID,
        clientName: 'Cliente',
        amount: '0',
        moraAmount: '0',
        totalReceived: '0',
        outstandingBalance: '0',
        installmentNumber: 0,
        totalInstallments: 0,
        collectorName: `${req.user.firstName} ${req.user.lastName}`,
      }),
    ),
  );

  const io = req.app.get('io');
  if (io && synced.length > 0) {
    io.emit('payments:batch-synced', {
      count: synced.length,
      collectorId: req.user.id,
    });
  }

  const summary = {
    total: results.length,
    synced: synced.length,
    conflicts: results.filter((r) => r.status === 'conflict').length,
    errors: results.filter((r) => r.status === 'error').length,
  };

  return success(res, { results, summary }, 'Sincronización completada');
});

export { registerPaymentHandler, batchSyncHandler };
