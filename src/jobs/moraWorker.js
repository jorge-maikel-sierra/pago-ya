import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';

/**
 * Inicia el worker de BullMQ que calcula y aplica intereses de mora
 * sobre cuotas vencidas e impagas.
 * @returns {Worker} Instancia del worker
 */
const startMoraWorker = () => {
  const worker = new Worker(
    'mora-calculation',
    async (job) => {
      // TODO: Implementar cálculo de mora usando src/engine/ + Prisma service
      console.log(`[MoraWorker] Procesando job ${job.id}:`, job.data);
    },
    {
      connection: redisClient,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[MoraWorker] Job ${job.id} completado`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[MoraWorker] Job ${job?.id} falló:`, err.message);
  });

  console.log('[MoraWorker] Escuchando cola "mora-calculation"');
  return worker;
};

export default startMoraWorker;
