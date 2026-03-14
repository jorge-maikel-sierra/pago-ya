import { z } from 'zod';

/**
 * Schema de validación para login de usuario.
 * POST /api/auth/login
 *
 * @type {z.ZodObject}
 */
const loginSchema = z.object({
  email: z
    .string({ required_error: 'email es obligatorio' })
    .trim()
    .toLowerCase()
    .email('Debe ser un email válido'),
  password: z
    .string({ required_error: 'password es obligatorio' })
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

/**
 * Schema de validación para registro de usuario.
 * POST /register
 *
 * @type {z.ZodObject}
 */
const registerSchema = z.object({
  firstName: z
    .string({ required_error: 'Nombre es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(50, 'El nombre no puede tener más de 50 caracteres'),
  lastName: z
    .string()
    .trim()
    .max(50, 'El apellido no puede tener más de 50 caracteres')
    .optional()
    .default(''),
  email: z
    .string({ required_error: 'Email es obligatorio' })
    .trim()
    .toLowerCase()
    .email('Debe ser un email válido')
    .max(100, 'El email no puede tener más de 100 caracteres'),
  password: z
    .string({ required_error: 'Contraseña es obligatoria' })
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'La contraseña no puede tener más de 100 caracteres'),
});

export { loginSchema, registerSchema };
