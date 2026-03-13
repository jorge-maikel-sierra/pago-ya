/**
 * Envuelve un controlador asíncrono de Express para capturar
 * errores y delegarlos automáticamente a next().
 * @param {Function} fn - Controlador async (req, res, next)
 * @returns {Function} Controlador Express con manejo de errores
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
