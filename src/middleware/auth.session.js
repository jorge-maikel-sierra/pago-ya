/**
 * Middleware de autenticación por sesión para el panel de administración EJS.
 * Verifica que exista `req.session.user`; si no, redirige al login.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifySession = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }

  // Adjuntar el usuario autenticado a req.user PARA API/servicios y
  // a res.locals.user PARA las vistas (EJS). Esto evita que las vistas
  // dependan de acceder a req directamente y facilita testing.
  req.user = req.session.user;
  // Asegurar que res.locals exista (los tests pueden simular `res` sin locals)
  if (!res.locals) res.locals = {};
  res.locals.user = req.session.user;

  return next();
};

export { verifySession };
