// Punto de entrada unificado mantenido por retrocompatibilidad.
// Las implementaciones están separadas por responsabilidad:
//   - auth.api.js     → verifyToken  (JWT para la API REST)
//   - auth.session.js → verifySession (sesión para el panel EJS)
export { verifyToken } from './auth.api.js';
export { verifySession } from './auth.session.js';
