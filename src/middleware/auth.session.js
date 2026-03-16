/**
 * Middleware de autenticación por sesión para el panel de administración EJS.
 * Requiere que req.session.user exista (guardado por postLogin sin Passport);
 * si no, redirige al login.
 */
const verifySession = (req, res, next) => {
  const sessionUser = req.session?.user;

  if (!sessionUser) {
    return res.redirect('/admin/login');
  }

  if (!res.locals) res.locals = {};
  res.locals.user = sessionUser;
  res.locals.currentUser = sessionUser;

  // Adjuntar a req.user para que los controladores puedan acceder de forma uniforme
  req.user = sessionUser;

  return next();
};

export { verifySession };
