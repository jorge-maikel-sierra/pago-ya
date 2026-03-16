import Redis from 'ioredis';
import env from './env.js';

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

const hasRedis = Boolean(env.REDIS_URL || env.REDIS_HOST);

let redisClientMutable = null;
if (hasRedis) {
  // Preferir REDIS_URL (Fly.io / Railway / Heroku) sobre host/port individuales
  redisClientMutable = env.REDIS_URL
    ? new Redis(env.REDIS_URL, redisOptions)
    : new Redis({
        ...redisOptions,
        host: env.REDIS_HOST,
        // env.REDIS_PORT ya fue convertido a Number por Zod (default 6379)
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
      });
}

const redisClient = redisClientMutable;

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
