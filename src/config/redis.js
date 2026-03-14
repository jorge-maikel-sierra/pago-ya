import Redis from 'ioredis';

/**
 * Crea el cliente Redis.
 * - En producción (Render) se usa REDIS_URL (connectionString del Key Value).
 * - En desarrollo se usan REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
 */
const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis({
      ...redisOptions,
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });

redisClient.on('connect', () => {
  console.log('[Redis] Conectado exitosamente');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Error de conexión:', err.message);
});

export default redisClient;
