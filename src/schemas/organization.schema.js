import { z } from 'zod';

/**
 * Tipos de plan disponibles para las organizaciones.
 * @type {readonly ['BASIC', 'PRO', 'ENTERPRISE']}
 */
const PLAN_TYPES = Object.freeze(['BASIC', 'PRO', 'ENTERPRISE']);

/**
 * Regex para validar colores hexadecimales (#RGB o #RRGGBB).
 */
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

/**
 * Schema de validación para crear una organización.
 * POST /admin/organizations
 *
 * @type {z.ZodObject}
 */
const createOrganizationSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'El nombre es obligatorio' })
      .min(3, 'El nombre debe tener al menos 3 caracteres')
      .max(150, 'El nombre no puede superar 150 caracteres')
      .trim(),

    nit: z
      .string()
      .max(20, 'El NIT no puede superar 20 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    phone: z
      .string()
      .max(20, 'El teléfono no puede superar 20 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    email: z
      .string()
      .email('El email no es válido')
      .max(100, 'El email no puede superar 100 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    address: z
      .string()
      .max(255, 'La dirección no puede superar 255 caracteres')
      .trim()
      .optional()
      .or(z.literal('')),

    logoUrl: z
      .string()
      .url('La URL del logo no es válida')
      .max(500, 'La URL del logo no puede superar 500 caracteres')
      .optional()
      .or(z.literal('')),

    primaryColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'El color debe ser un hexadecimal válido (#RGB o #RRGGBB)')
      .default('#00C566'),

    planType: z
      .enum(PLAN_TYPES, {
        errorMap: () => ({ message: `El plan debe ser uno de: ${PLAN_TYPES.join(', ')}` }),
      })
      .default('BASIC'),

    subscriptionEnds: z
      .string()
      .date('La fecha de vencimiento debe ser válida (YYYY-MM-DD)')
      .optional()
      .or(z.literal('')),

    moraGraceDays: z
      .union([z.string(), z.number()])
      .transform((val) => (val === '' ? 0 : Number(val)))
      .pipe(
        z
          .number()
          .int('Los días de gracia deben ser un número entero')
          .min(0, 'Los días de gracia no pueden ser negativos')
          .max(30, 'Los días de gracia no pueden superar 30'),
      )
      .default(0),

    moraMultiplier: z
      .union([z.string(), z.number()])
      .transform((val) => (val === '' ? 1.5 : Number(val)))
      .pipe(
        z
          .number()
          .min(1, 'El multiplicador de mora debe ser al menos 1')
          .max(5, 'El multiplicador de mora no puede superar 5'),
      )
      .default(1.5),

    isActive: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true' || val === 'on')
      .default(true),
  }),
});

/**
 * Schema de validación para actualizar una organización.
 * PUT /admin/organizations/:id
 *
 * @type {z.ZodObject}
 */
const updateOrganizationSchema = createOrganizationSchema;

export { createOrganizationSchema, updateOrganizationSchema, PLAN_TYPES };
