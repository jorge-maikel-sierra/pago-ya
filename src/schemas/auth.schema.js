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

export { loginSchema };
