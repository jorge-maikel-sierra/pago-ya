import { z } from 'zod';

/**
 * Roles de usuario disponibles en el sistema.
 * @type {readonly ['SUPER_ADMIN', 'ADMIN', 'COLLECTOR']}
 */
const USER_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'COLLECTOR']);

/**
 * Roles disponibles para que un ADMIN pueda asignar (no puede crear SUPER_ADMIN).
 * @type {readonly ['ADMIN', 'COLLECTOR']}
 */
const ASSIGNABLE_ROLES = Object.freeze(['ADMIN', 'COLLECTOR']);

/**
 * Schema de validación para crear un usuario.
 * POST /admin/users
 *
 * @type {z.ZodObject}
 */
const createUserSchema = z.object({
  body: z.object({
    firstName: z
      .string({ required_error: 'El nombre es obligatorio' })
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(80, 'El nombre no puede superar 80 caracteres')
      .trim(),

    lastName: z
      .string({ required_error: 'El apellido es obligatorio' })
      .min(2, 'El apellido debe tener al menos 2 caracteres')
      .max(80, 'El apellido no puede superar 80 caracteres')
      .trim(),

    email: z
      .string({ required_error: 'El email es obligatorio' })
      .email('El email no es válido')
      .max(100, 'El email no puede superar 100 caracteres')
      .trim()
      .toLowerCase(),

    phone: z
      .string()
      .max(20, 'El teléfono no puede superar 20 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    role: z.enum(ASSIGNABLE_ROLES, {
      errorMap: () => ({ message: `El rol debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}` }),
    }),

    password: z
      .string({ required_error: 'La contraseña es obligatoria' })
      .min(6, 'La contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña no puede superar 100 caracteres'),

    isActive: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true' || val === 'on')
      .default(true),
  }),
});

/**
 * Schema de validación para actualizar un usuario.
 * PUT /admin/users/:id
 *
 * La contraseña es opcional: si se envía, se actualiza; si está vacía, se mantiene.
 *
 * @type {z.ZodObject}
 */
const updateUserSchema = z.object({
  body: z.object({
    firstName: z
      .string({ required_error: 'El nombre es obligatorio' })
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(80, 'El nombre no puede superar 80 caracteres')
      .trim(),

    lastName: z
      .string({ required_error: 'El apellido es obligatorio' })
      .min(2, 'El apellido debe tener al menos 2 caracteres')
      .max(80, 'El apellido no puede superar 80 caracteres')
      .trim(),

    email: z
      .string({ required_error: 'El email es obligatorio' })
      .email('El email no es válido')
      .max(100, 'El email no puede superar 100 caracteres')
      .trim()
      .toLowerCase(),

    phone: z
      .string()
      .max(20, 'El teléfono no puede superar 20 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    role: z.enum(ASSIGNABLE_ROLES, {
      errorMap: () => ({ message: `El rol debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}` }),
    }),

    password: z
      .string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña no puede superar 100 caracteres')
      .optional()
      .or(z.literal('')),

    isActive: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true' || val === 'on')
      .default(true),
  }),
  params: z.object({
    id: z.string().uuid('El ID del usuario debe ser un UUID válido'),
  }),
});

export { createUserSchema, updateUserSchema, USER_ROLES, ASSIGNABLE_ROLES };
