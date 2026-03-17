import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';
import { processMoraForOrganization } from '../services/mora.service.js';

/**
 * Inicia el worker de BullMQ que calcula y aplica intereses de mora
 * sobre cuotas vencidas e impagas de todos los préstamos activos de
 * una organización.
 *
 * El job debe tener el campo `organizationId` en su payload:
 * ```js
 * await moraQueue.add('calculate', { organizationId: 'uuid' });
 * ```
 *
 * @returns {Worker} Instancia del worker
 */
const startMoraWorker = () => {
  const worker = new Worker(
    'mora-calculation',
    async (job) => {
      const { organizationId } = job.data;

      if (!organizationId) {
        throw new Error('El job de mora requiere organizationId en job.data');
      }

      console.log(`[MoraWorker] Iniciando cálculo de mora para org ${organizationId}`);

      const result = await processMoraForOrganization(organizationId);

      console.log(
        `[MoraWorker] Org ${organizationId} — ` +
          `procesados: ${result.processed}, errores: ${result.errors}, ` +
          `mora total: $${result.totalMora}`,
      );

      return result;
    },
    {
      connection: redisClient,
      // Concurrencia 1 para evitar race conditions entre jobs del mismo org
      concurrency: 1,
    },
  );

  worker.on('completed', (job, returnValue) => {
    console.log(`[MoraWorker] Job ${job.id} completado:`, returnValue);
  });

  worker.on('failed', (job, err) => {
    console.error(`[MoraWorker] Job ${job?.id} falló:`, err.message);
  });

  console.log('[MoraWorker] Escuchando cola "mora-calculation"');
  return worker;
};

export default startMoraWorker;
