import { z } from 'zod';

/**
 * Schema de validación para crear un cobrador.
 * POST /admin/collectors
 *
 * @type {z.ZodObject}
 */
const createCollectorSchema = z.object({
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

    password: z
      .string({ required_error: 'La contraseña es obligatoria' })
      .min(6, 'La contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña no puede superar 100 caracteres'),
  }),
});

/**
 * Schema de validación para actualizar un cobrador.
 * PUT /admin/collectors/:id
 *
 * La contraseña es opcional: si se envía, se actualiza; si está vacía, se mantiene.
 *
 * @type {z.ZodObject}
 */
const updateCollectorSchema = z.object({
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

    password: z
      .string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña no puede superar 100 caracteres')
      .optional()
      .or(z.literal('')),

    isActive: z.preprocess(
      (val) => (Array.isArray(val) ? val[val.length - 1] : val),
      z
        .union([z.boolean(), z.string()])
        .transform((val) => val === true || val === 'true' || val === 'on')
        .default(true),
    ),
  }),
  params: z.object({
    id: z.string().uuid('El ID del cobrador debe ser un UUID válido'),
  }),
});

export { createCollectorSchema, updateCollectorSchema };
