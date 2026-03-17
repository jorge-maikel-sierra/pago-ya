import { Queue } from 'bullmq';
import redisClient from '../config/redis.js';
import prisma from '../config/prisma.js';

/**
 * Programa un job repetible de cálculo de mora para cada organización activa.
 *
 * BullMQ garantiza que el job repetible sea idempotente: si ya existe uno con
 * el mismo jobId+pattern, no lo duplica. Esto permite llamar a esta función
 * en cada arranque del servidor sin efecto secundario.
 *
 * El job se ejecuta diariamente a las 02:00 (hora UTC) para calcular y
 * acumular la mora del día sobre cuotas vencidas e impagas.
 * También encola un job inmediato al iniciar para cubrir el período en que
 * el servidor estuvo apagado.
 *
 * @returns {Promise<void>}
 */
const scheduleMoraJobs = async () => {
  const moraQueue = new Queue('mora-calculation', { connection: redisClient });

  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  // Encolar jobs en paralelo — BullMQ garantiza idempotencia por jobId
  await Promise.all(
    organizations.map((org) => {
      const jobId = `mora-daily-${org.id}`;

      const repeatJob = moraQueue.add(
        'calculate',
        { organizationId: org.id },
        {
          jobId,
          repeat: { pattern: '0 2 * * *' },
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 30 },
        },
      );

      // Job inmediato al arrancar: cubre mora acumulada mientras el servidor estuvo inactivo
      const startupJob = moraQueue.add(
        'calculate',
        { organizationId: org.id },
        {
          jobId: `${jobId}-startup-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: { count: 5 },
        },
      );

      console.log(`[MoraScheduler] Jobs programados para org "${org.name}" (${org.id})`);

      return Promise.all([repeatJob, startupJob]);
    }),
  );

  await moraQueue.close();
};

export default scheduleMoraJobs;
