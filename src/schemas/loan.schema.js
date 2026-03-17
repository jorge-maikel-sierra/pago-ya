import { z } from 'zod';

const AMORTIZATION_TYPES = Object.freeze(['FIXED', 'DECLINING_BALANCE']);
const PAYMENT_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);

/**
 * Schema de validación para crear un préstamo.
 * POST /api/v1/loans
 *
 * Campos monetarios (principal, interestRate) se validan como number
 * y se transforman a string para evitar errores de punto flotante.
 * El servicio/controlador debe usar Decimal.js con el valor string.
 *
 * @type {z.ZodObject}
 */
const createLoanSchema = z.object({
  clientId: z
    .string({ required_error: 'clientId es obligatorio' })
    .uuid('clientId debe ser un UUID válido'),
  collectorId: z.string().uuid('collectorId debe ser un UUID válido').optional(),
  principalAmount: z
    .number({ required_error: 'principalAmount es obligatorio' })
    .positive('principalAmount debe ser mayor a 0')
    .transform(String),
  // Tasa de interés MENSUAL — se multiplica por el número de meses en el engine
  interestRate: z
    .number({ required_error: 'interestRate es obligatorio' })
    .positive('interestRate debe ser mayor a 0')
    .max(1, 'interestRate no puede superar 1 (100%)')
    .transform(String),
  // Plazo en meses — el engine calcula automáticamente el número de cuotas
  termMonths: z
    .number({ required_error: 'termMonths es obligatorio' })
    .int('termMonths debe ser un entero')
    .positive('termMonths debe ser mayor a 0')
    .max(24, 'termMonths no puede superar 24 meses'),
  // Aceptar la fecha en formato YYYY-MM-DD desde el formulario HTML.
  disbursementDate: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const parts = val.split('-').map((p) => Number(p));
        if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
          const [year, month, day] = parts;
          return new Date(year, month - 1, day);
        }
        return new Date(val);
      }
      return val;
    },
    z.date({
      required_error: 'disbursementDate es obligatorio',
      invalid_type_error: 'disbursementDate debe ser una fecha válida (YYYY-MM-DD)',
    }),
  ),
  paymentFrequency: z
    .enum(PAYMENT_FREQUENCIES, {
      errorMap: () => ({
        message: `paymentFrequency debe ser uno de: ${PAYMENT_FREQUENCIES.join(', ')}`,
      }),
    })
    .default('DAILY'),
  // Interés simple siempre usa cuota fija — no se expone al usuario
  amortizationType: z
    .enum(AMORTIZATION_TYPES, {
      errorMap: () => ({
        message: `amortizationType debe ser uno de: ${AMORTIZATION_TYPES.join(', ')}`,
      }),
    })
    .optional()
    .default('FIXED'),
  notes: z.string().max(1000, 'notes no puede superar 1000 caracteres').optional(),
});

/**
 * Schema de validación para actualizar un préstamo.
 * PUT /api/v1/loans/:id
 *
 * @type {z.ZodObject}
 */
const updateLoanSchema = createLoanSchema.omit({ clientId: true, principalAmount: true }).partial();

export { createLoanSchema, updateLoanSchema, AMORTIZATION_TYPES, PAYMENT_FREQUENCIES };
