import Redis from 'ioredis';

/**
 * Crea el cliente Redis si las variables de entorno están configuradas.
 * Retorna null cuando Redis no está disponible (plan gratuito / dev sin Redis).
 *
 * - Producción con Redis:   define REDIS_URL
 * - Desarrollo con Redis:   define REDIS_HOST (+ REDIS_PORT / REDIS_PASSWORD)
 * - Sin Redis:              no define ninguna de las variables anteriores
 */
const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
};

const hasRedis = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

const redisClient = hasRedis
  ? process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisOptions)
    : new Redis({
        ...redisOptions,
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      })
  : null;

if (redisClient) {
  redisClient.on('connect', () => {
    console.log('[Redis] Conectado exitosamente');
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error de conexión:', err.message);
  });
} else {
  // Redis no configurado — sesiones en memoria, colas BullMQ desactivadas
  console.warn('[Redis] No configurado — funcionando sin Redis (plan gratuito)');
}

export default redisClient;
