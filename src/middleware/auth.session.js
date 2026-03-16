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

  req.user = req.session.user;
  return next();
};

export { verifySession };
