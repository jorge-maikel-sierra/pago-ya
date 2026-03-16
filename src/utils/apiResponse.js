/**
 * Genera una respuesta JSON exitosa estandarizada.
 *
 * Estructura de respuesta:
 * {
 *   data: object | array | null,
 *   meta: object | null,   ← paginación u otros metadatos opcionales
 *   error: null
 * }
 *
 * @param {import('express').Response} res
 * @param {object|Array|null} [data=null]
 * @param {number} [statusCode=200]
 * @param {object|null} [meta=null]
 * @returns {import('express').Response}
 */
const success = (res, data = null, statusCode = 200, meta = null) =>
  res.status(statusCode).json({
    data,
    meta,
    error: null,
  });

/**
 * Genera una respuesta JSON de error estandarizada.
 *
 * Estructura de respuesta:
 * {
 *   data: null,
 *   meta: null,
 *   error: { message, code, details? }
 * }
 *
 * @param {import('express').Response} res
 * @param {string} [message='Error interno del servidor']
 * @param {number} [statusCode=500]
 * @param {Array} [details=[]]   ← errores de campo de Zod u otros detalles
 * @param {string} [code='INTERNAL_ERROR']
 * @returns {import('express').Response}
 */
const error = (
  res,
  message = 'Error interno del servidor',
  statusCode = 500,
  details = [],
  code = 'INTERNAL_ERROR',
) =>
  res.status(statusCode).json({
    data: null,
    meta: null,
    error: {
      message,
      code,
      ...(details.length > 0 && { details }),
    },
  });

export { success, error };
