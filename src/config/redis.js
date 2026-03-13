import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redisClient.on('connect', () => {
  console.log('[Redis] Conectado exitosamente');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Error de conexión:', err.message);
});

export default redisClient;
