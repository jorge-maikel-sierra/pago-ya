import { z } from 'zod';

const DOCUMENT_TYPES = Object.freeze(['CC', 'CE', 'TI', 'NIT', 'PP', 'PEP']);

/**
 * Schema de validación para los campos de un cliente.
 * Usado directamente en servicios y tests para validar datos planos.
 *
 * @type {z.ZodObject}
 */
const createClientSchema = z.object({
  firstName: z
    .string({ required_error: 'El nombre es obligatorio' })
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(80, 'El nombre no puede superar 80 caracteres'),

  lastName: z
    .string({ required_error: 'El apellido es obligatorio' })
    .trim()
    .min(1, 'El apellido no puede estar vacío')
    .max(80, 'El apellido no puede superar 80 caracteres'),

  documentType: z
    .enum(DOCUMENT_TYPES, {
      errorMap: () => ({
        message: `El tipo de documento debe ser uno de: ${DOCUMENT_TYPES.join(', ')}`,
      }),
    })
    .default('CC'),

  documentNumber: z
    .string({ required_error: 'La cédula es obligatoria' })
    .trim()
    .min(1, 'La cédula no puede estar vacía')
    .max(30, 'La cédula no puede superar 30 caracteres'),

  phone: z
    .string()
    .trim()
    .max(20, 'El teléfono no puede superar 20 caracteres')
    .optional()
    .or(z.literal('')),

  address: z
    .string({ required_error: 'La dirección es obligatoria' })
    .trim()
    .min(1, 'La dirección no puede estar vacía')
    .max(255, 'La dirección no puede superar 255 caracteres'),

  neighborhood: z
    .string()
    .trim()
    .max(100, 'El barrio no puede superar 100 caracteres')
    .optional()
    .or(z.literal('')),

  city: z
    .string()
    .trim()
    .max(100, 'La ciudad no puede superar 100 caracteres')
    .default('Riohacha'),

  referenceContact: z
    .string()
    .trim()
    .max(100, 'El nombre del referido no puede superar 100 caracteres')
    .optional()
    .or(z.literal('')),

  referencePhone: z
    .string()
    .trim()
    .max(20, 'El teléfono del referido no puede superar 20 caracteres')
    .optional()
    .or(z.literal('')),

  businessName: z
    .string()
    .trim()
    .max(150, 'El nombre del negocio no puede superar 150 caracteres')
    .optional()
    .or(z.literal('')),

  businessAddress: z
    .string()
    .trim()
    .max(255, 'La dirección del negocio no puede superar 255 caracteres')
    .optional()
    .or(z.literal('')),

  notes: z
    .string()
    .max(1000, 'Las notas no pueden superar 1000 caracteres')
    .optional()
    .or(z.literal('')),

  routeId: z.string().uuid('routeId debe ser un UUID válido').optional().or(z.literal('')),

  latitude: z.number().min(-90).max(90).optional(),

  longitude: z.number().min(-180).max(180).optional(),

  isActive: z.preprocess(
    (val) => (Array.isArray(val) ? val[val.length - 1] : val),
    z
      .union([z.boolean(), z.string(), z.undefined()])
      .optional()
      .transform((val) => {
        if (val === undefined) return true; // default para crear
        return val === true || val === 'true' || val === 'on';
      }),
  ),
});

/**
 * Schema de validación para actualizar un cliente (todos los campos opcionales).
 * PUT /admin/clients/:id
 *
 * isActive se omite del partial ya que tiene lógica de transformación propia
 * que devuelve `true` por defecto — en updates se trata de forma explícita.
 *
 * @type {z.ZodObject}
 */
const updateClientSchema = createClientSchema.omit({ isActive: true }).partial();

// Wrappers con envelope { body, params } para el middleware validate()
const createClientMiddlewareSchema = z.object({ body: createClientSchema });
const updateClientMiddlewareSchema = z.object({
  body: updateClientSchema,
  params: z.object({ id: z.string().uuid('El ID del cliente debe ser un UUID válido') }),
});

export {
  createClientSchema,
  updateClientSchema,
  createClientMiddlewareSchema,
  updateClientMiddlewareSchema,
  DOCUMENT_TYPES,
};
