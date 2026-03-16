import { z } from 'zod';

/**
 * Helper: acepta un string vacío y lo convierte a undefined, luego valida la URL.
 * Permite que variables opcionales de URL puedan estar definidas pero vacías
 * en .env/.env.test sin que la validación falle.
 */
const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined))
  .refine((v) => v === undefined || /^https?:\/\//.test(v), {
    message: 'Debe ser una URL válida (http:// o https://)',
  });

/**
 * Esquema de validación y transformación de variables de entorno.
 *
 * - Falla inmediatamente (fail-fast) si faltan variables críticas en cualquier entorno.
 * - Transforma strings a tipos correctos (Number via z.coerce, booleans via comparación).
 * - Centraliza la lectura de process.env; el resto del código no debe acceder a él
 *   directamente (excepto middlewares que los tests necesitan mutar en beforeEach).
 */
const envSchema = z.object({
  // --- Entorno ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Servidor ---
  // z.coerce.number convierte el string de la env var a número antes de validar
  PORT: z.coerce.number().int().positive().default(3000),
  // Acepta string vacío; usa el default si no está definida o está vacía
  CORS_ORIGIN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : 'http://localhost:3000')),

  // --- Base de datos ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // --- Redis (opcional — si ninguna se define, los workers y caché quedan desactivados) ---
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // --- JWT (obligatorio en todos los entornos) ---
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // --- Sesión (obligatorio en todos los entornos) ---
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),

  // --- Telegram (totalmente opcional — si no hay token el bot queda desactivado) ---
  TELEGRAM_BOT_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : undefined)),
  TELEGRAM_CHAT_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : undefined)),
  // Acepta string vacío como "no configurado" — en producción debe ser una URL real
  TELEGRAM_WEBHOOK_URL: optionalUrl,

  // --- Tasas regulatorias (Colombia, Ley 510/99) ---
  // z.coerce.number convierte el string a float antes de validar
  USURY_RATE_ANNUAL: z.coerce.number().positive().optional(),
  DEFAULT_MORA_RATE_ANNUAL: z.coerce.number().positive().optional(),

  // --- Debug (vacío en producción — ruta de diagnóstico desactivada si no existe) ---
  DEBUG_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : undefined)),
});

/**
 * Parsea y valida process.env contra el esquema.
 * Si la validación falla, imprime los campos inválidos/faltantes y termina el
 * proceso antes de que la app arranque (fail-fast).
 *
 * @returns {z.infer<typeof envSchema>}
 */
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (err) {
    // Formatear los errores de forma legible antes de abortar
    const issues = err.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`[Config] ✗ Variables de entorno inválidas o faltantes:\n${issues}`);
    process.exit(1);
    // La línea siguiente es inalcanzable en runtime pero satisface consistent-return:
    // process.exit lanza una excepción interna que detiene la ejecución.
    return undefined;
  }
};

const env = parseEnv();

export default env;
