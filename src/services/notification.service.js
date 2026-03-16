import { Queue } from 'bullmq';
import redisClient from '../config/redis.js';
import { QUEUE_NAME as TELEGRAM_QUEUE_NAME } from '../jobs/telegramWorker.js';

export const PDF_QUEUE_NAME = 'pdf-generation';

// Las colas se inicializan una sola vez como singletons — fuera de los controllers
const telegramQueue = redisClient
  ? new Queue(TELEGRAM_QUEUE_NAME, { connection: redisClient })
  : null;

const pdfQueue = redisClient
  ? new Queue(PDF_QUEUE_NAME, {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    })
  : null;

/**
 * Encola el envío de un comprobante de pago por Telegram.
 * No lanza si Redis no está disponible — la notificación es opcional.
 *
 * @param {object} paymentData - Datos del recibo (paymentId, chatId, clientName, amount, etc.)
 * @returns {Promise<void>}
 */
export const enqueuePaymentReceipt = async (paymentData) => {
  if (!telegramQueue) return;
  await telegramQueue.add('payment-receipt', {
    type: 'payment-receipt',
    data: paymentData,
  });
};

/**
 * Encola un job de generación de PDF de cartera en segundo plano.
 * Lanza error si Redis no está disponible, para que el controller muestre mensaje al usuario.
 *
 * @param {{ organizationId: string, reportDate: string, requestedBy: string }} jobData
 * @param {string} jobId - ID único del job para evitar duplicados
 * @returns {Promise<void>}
 * @throws {Error} Si Redis no está configurado
 */
export const enqueuePdfGeneration = async (jobData, jobId) => {
  if (!pdfQueue) {
    const err = new Error('La generación de PDF no está disponible (Redis requerido).');
    err.statusCode = 503;
    throw err;
  }
  await pdfQueue.add('generate-portfolio-pdf', jobData, { jobId });
};
