/**
 * Middleware de autenticación por sesión para el panel de administración EJS.
 * Requiere que Passport haya deserializado un usuario; si no, redirige al login.
 */
const verifySession = (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect('/admin/login');
  }

  if (!res.locals) res.locals = {};
  res.locals.user = req.user;
  res.locals.currentUser = req.user;

  return next();
};

export { verifySession };
