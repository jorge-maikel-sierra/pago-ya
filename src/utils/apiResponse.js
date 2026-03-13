/**
 * Genera una respuesta JSON exitosa estandarizada.
 * @param {import('express').Response} res
 * @param {object} [data={}]
 * @param {string} [message='OK']
 * @param {number} [statusCode=200]
 * @returns {import('express').Response}
 */
const success = (res, data = {}, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });

/**
 * Genera una respuesta JSON de error estandarizada.
 * @param {import('express').Response} res
 * @param {string} [message='Error interno del servidor']
 * @param {number} [statusCode=500]
 * @param {Array} [errors=[]]
 * @returns {import('express').Response}
 */
const error = (res, message = 'Error interno del servidor', statusCode = 500, errors = []) =>
  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });

export { success, error };
