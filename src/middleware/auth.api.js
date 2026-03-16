import passport from '../config/passport.js';

// JWT_SECRET se lee desde process.env en cada llamada (no desde env.js cacheado)
// para permitir que los tests lo sobreescriban en beforeEach sin reiniciar el módulo.

/**
 */
const verifyToken = (req, res, next) =>
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      const message = info?.message || 'Token inválido';
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message, code: 'UNAUTHORIZED' },
      });
    }

    req.user = user;
    if (!res.locals) res.locals = {};
    res.locals.user = user;
    return next();
  })(req, res, next);

export { verifyToken };
