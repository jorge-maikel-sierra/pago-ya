import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/**
 * Mapeo de códigos de error de Prisma a respuestas HTTP legibles.
 */
const PRISMA_ERROR_MAP = Object.freeze({
  P2002: {
    statusCode: 409,
    message: 'El registro ya existe (valor duplicado)',
  },
  P2021: {
    statusCode: 500,
    message:
      'La estructura de la base de datos no coincide con el esquema. Ejecuta las migraciones pendientes.',
  },
  P2025: {
    statusCode: 404,
    message: 'Registro no encontrado',
  },
  P2003: {
    statusCode: 400,
    message: 'Violación de clave foránea',
  },
  P2014: {
    statusCode: 400,
    message: 'La operación viola una restricción de relación',
  },
});

/**
 * Determina si la petición espera HTML (navegador/panel EJS)
 * o JSON (API móvil / fetch).
 *
 * @param {import('express').Request} req
 * @returns {boolean} true si el cliente prefiere HTML
 */
const wantsHtml = (req) => req.accepts(['html', 'json']) === 'html';

/**
 * Envía la respuesta de error como HTML (render EJS) o JSON
 * según lo que acepte el cliente.
 *
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {number} statusCode
 * @param {string} message
 * @param {Array} [errors=[]]
 * @param {string} [stack=undefined]
 */
const sendError = (res, req, statusCode, message, errors = [], stack = undefined) => {
  if (wantsHtml(req)) {
    return res.status(statusCode).render('error', {
      title: `Error ${statusCode}`,
      statusCode,
      message,
      errors,
      stack: process.env.NODE_ENV === 'development' ? stack : undefined,
      user: req.user || { firstName: '', lastName: '', role: 'ADMIN' },
      currentPath: '',
    });
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
    ...(process.env.NODE_ENV === 'development' && stack && { stack }),
  });
};

/**
 * Middleware global de manejo de errores para Express.
 * Captura todos los errores lanzados en controladores y middleware.
 *
 * Orden de evaluación:
 * 1. ZodError → 422 (Unprocessable Entity) con detalle de campos
 * 2. Prisma Known Errors → código HTTP según PRISMA_ERROR_MAP
 * 3. Errores operacionales con statusCode → código apropiado
 * 4. Todo lo demás → 500
 *
 * Content Negotiation:
 * - Si el cliente acepta HTML → renderiza views/error.ejs
 * - Si el cliente acepta JSON → responde JSON estandarizado
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  console.error('[ErrorHandler] ==================== ERROR ====================');
  console.error('[ErrorHandler] Nombre:', err.name);
  console.error('[ErrorHandler] Mensaje:', err.message);
  console.error('[ErrorHandler] Path:', err.path);
  console.error('[ErrorHandler] Ruta solicitada:', req.method, req.originalUrl);
  console.error('[ErrorHandler] Stack:', err.stack);
  console.error('[ErrorHandler] =================================================');

  // --- 1. Errores de validación Zod → 422 ---
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    return sendError(res, req, 422, 'Error de validación', details);
  }

  // --- 2. Errores de Prisma Client (Known Request Errors) ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code];

    if (mapped) {
      const detail =
        err.code === 'P2002' && err.meta?.target
          ? `${mapped.message}: ${Array.isArray(err.meta.target) ? err.meta.target.join(', ') : err.meta.target}`
          : mapped.message;

      return sendError(res, req, mapped.statusCode, detail);
    }
  }

  // --- 3. Errores de validación de Prisma ---
  if (err instanceof Prisma.PrismaClientValidationError) {
    const message =
      process.env.NODE_ENV === 'development' ? err.message : 'Error de validación en la consulta';

    return sendError(res, req, 400, message);
  }

  // --- 4. Errores operacionales con statusCode explícito ---
  if (err.isOperational) {
    return sendError(res, req, err.statusCode || 500, err.message);
  }

  // --- 5. Errores inesperados → 500 ---
  if (process.env.NODE_ENV === 'development') {
    console.error('[ErrorHandler]', err);
  }

  return sendError(res, req, 500, 'Error interno del servidor', [], err.stack);
};

export default errorHandler;
export { PRISMA_ERROR_MAP, wantsHtml };
