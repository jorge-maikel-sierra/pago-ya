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
  interestRate: z
    .number({ required_error: 'interestRate es obligatorio' })
    .positive('interestRate debe ser mayor a 0')
    .max(100, 'interestRate no puede superar 100%')
    .transform((val) => String(val / 100)),
  numberOfPayments: z
    .number({ required_error: 'numberOfPayments es obligatorio' })
    .int('numberOfPayments debe ser un entero')
    .positive('numberOfPayments debe ser mayor a 0')
    .max(365, 'numberOfPayments no puede superar 365'),
  disbursementDate: z
    .string({ required_error: 'disbursementDate es obligatorio' })
    .date('disbursementDate debe ser una fecha válida (YYYY-MM-DD)'),
  paymentFrequency: z
    .enum(PAYMENT_FREQUENCIES, {
      errorMap: () => ({
        message: `paymentFrequency debe ser uno de: ${PAYMENT_FREQUENCIES.join(', ')}`,
      }),
    })
    .default('DAILY'),
  amortizationType: z
    .enum(AMORTIZATION_TYPES, {
      errorMap: () => ({
        message: `amortizationType debe ser uno de: ${AMORTIZATION_TYPES.join(', ')}`,
      }),
    })
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
