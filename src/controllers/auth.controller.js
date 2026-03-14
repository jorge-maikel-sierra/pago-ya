import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';
import { registerSchema } from '../schemas/auth.schema.js';

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
  try {
    const validatedData = registerSchema.parse(req.body);

    await authService.registerOrganizationAndUser(validatedData);

    req.session.flashSucess = 'Cuenta creada correctamente. Puedes iniciar sesión.';
    // Esperar a que la sesión se guarde antes de redirigir para que la
    // cookie se envíe correctamente detrás del proxy de Fly.io
    return req.session.save(() => res.redirect('/admin/login'));

  } catch (err) {
    if (err.name === 'ZodError') {
      req.session.flashError = err.errors[0].message;
      return req.session.save(() => res.redirect('/register'));
    }

    req.session.flashError = err.message || 'Error al crear la cuenta. Inténtalo de nuevo.';
    return req.session.save(() => res.redirect('/register'));
  }
});
