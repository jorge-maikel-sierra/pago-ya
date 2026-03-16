/**
 * Middleware de Role-Based Access Control (RBAC).
 * Verifica que `req.user.role` esté dentro de los roles permitidos.
 * Debe usarse DESPUÉS de `verifyToken` o `verifySession`.
 *
 * @param {...string} roles - Roles permitidos (ej: 'SUPER_ADMIN', 'ADMIN', 'COLLECTOR')
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/admin/users', verifyToken, authorize('SUPER_ADMIN', 'ADMIN'), listUsers);
 */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message: 'No autenticado', code: 'UNAUTHORIZED' },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        data: null,
        meta: null,
        error: { message: 'No tiene permisos para acceder a este recurso', code: 'FORBIDDEN' },
      });
    }

    return next();
  };

export default authorize;
