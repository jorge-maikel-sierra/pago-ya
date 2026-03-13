import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';
import { sendPaymentReceipt, sendMoraAlert } from '../services/telegram.service.js';

/**
 * Nombres de las colas de Telegram procesadas por este worker.
 */
const QUEUE_NAME = 'telegram-receipts';

/**
 * Inicia el worker de BullMQ que procesa notificaciones de Telegram.
 *
 * Cola: telegram-receipts
 * - Concurrencia: 5 jobs simultáneos
 * - Reintentos: 3 con backoff exponencial (1s base)
 * - Tipos de job: 'payment-receipt' | 'mora-alert'
 *
 * @returns {Worker} Instancia del worker
 */
const startTelegramWorker = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { type, data } = job.data;

      switch (type) {
        case 'payment-receipt':
          await sendPaymentReceipt(data);
          break;
        case 'mora-alert':
          await sendMoraAlert(data);
          break;
        default:
          throw new Error(`Tipo de job desconocido: ${type}`);
      }
    },
    {
      connection: redisClient,
      concurrency: 5,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`[TelegramWorker] Job ${job.id} (${job.data.type}) completado`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[TelegramWorker] Job ${job?.id} (${job?.data?.type}) falló (intento ${job?.attemptsMade}/${job?.opts?.attempts}):`,
      err.message,
    );
  });

  console.log(`[TelegramWorker] Escuchando cola "${QUEUE_NAME}"`);
  return worker;
};

export default startTelegramWorker;
export { QUEUE_NAME };
