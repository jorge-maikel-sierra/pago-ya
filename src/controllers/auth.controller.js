import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';
/**
 * GET /register
 * Renderiza el formulario de registro.
 */
export const getRegister = (req, res) => {
  const { flashError, flashSucess } = req.session;
  delete req.session.flashError;
  delete req.session.flashSucess;

  return res.render('auth/register', {
    title: 'Crear cuenta',
    flashError,
    flashSucess,
    currentPath: '/register',
  });
};

/**
 * POST /register
 * Procesa el formulario de registro: valida campos, evita duplicados,
 * crea una organización y el usuario asociado (SUPER_ADMIN), hashea la
 * contraseña y redirige al login.
 */
export const postRegister = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  // Validación mínima en servidor
  if (!firstName || !email || !password) {
    req.session.flashError = 'Por favor completa nombre, correo y contraseña.';
    return res.redirect('/register');
  }

  try {
    await authService.registerOrganizationAndUser({ firstName, lastName, email, password });
  } catch (err) {
    // Servicio lanza error con statusCode cuando el email ya existe
    req.session.flashError = err.message || 'Error al crear la cuenta';
    return res.redirect('/register');
  }

  req.session.flashSucess = 'Cuenta creada correctamente. Puedes iniciar sesión.';
  return res.redirect('/admin/login');
});
