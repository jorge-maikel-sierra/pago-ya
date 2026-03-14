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
  console.log('[Registration] Inicio de proceso de registro:', { 
    email: req.body.email,
    firstName: req.body.firstName,
    hasPassword: !!req.body.password
  });

  try {
    // Validación con schema de Zod
    const validatedData = registerSchema.parse(req.body);
    console.log('[Registration] Datos validados correctamente');

    const result = await authService.registerOrganizationAndUser(validatedData);
    
    console.log('[Registration] Usuario creado exitosamente:', {
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.organization.id
    });

    req.session.flashSucess = 'Cuenta creada correctamente. Puedes iniciar sesión.';
    return res.redirect('/admin/login');

  } catch (err) {
    console.error('[Registration] Error en registro:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Manejar errores de validación de Zod
    if (err.name === 'ZodError') {
      const firstError = err.errors[0];
      req.session.flashError = firstError.message;
      return res.redirect('/register');
    }

    // Manejar otros errores del servicio
    req.session.flashError = err.message || 'Error al crear la cuenta. Inténtalo de nuevo.';
    return res.redirect('/register');
  }
});
