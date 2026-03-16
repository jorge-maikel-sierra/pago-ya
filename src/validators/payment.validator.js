import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schema de validación para registrar un pago individual.
 * POST /api/v1/payments
 */
const registerPaymentSchema = z.object({
  loanId: z
    .string({ required_error: 'loanId es obligatorio' })
    .regex(UUID_REGEX, 'loanId debe ser un UUID válido'),
  amountPaid: z
    .number({ required_error: 'amountPaid es obligatorio' })
    .positive('amountPaid debe ser mayor a 0'),
  offlineCreatedAt: z
    .string({ required_error: 'offlineCreatedAt es obligatorio' })
    .datetime({ message: 'offlineCreatedAt debe ser una fecha ISO 8601 válida' }),
  paymentScheduleId: z
    .string()
    .regex(UUID_REGEX, 'paymentScheduleId debe ser un UUID válido')
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Schema para un ítem dentro del batch de sincronización offline.
 */
const batchItemSchema = z.object({
  localId: z
    .string({ required_error: 'localId es obligatorio' })
    .min(1, 'localId no puede estar vacío'),
  loanId: z
    .string({ required_error: 'loanId es obligatorio' })
    .regex(UUID_REGEX, 'loanId debe ser un UUID válido'),
  amountPaid: z
    .number({ required_error: 'amountPaid es obligatorio' })
    .positive('amountPaid debe ser mayor a 0'),
  offlineCreatedAt: z
    .string({ required_error: 'offlineCreatedAt es obligatorio' })
    .datetime({ message: 'offlineCreatedAt debe ser una fecha ISO 8601 válida' }),
  paymentScheduleId: z
    .string()
    .regex(UUID_REGEX, 'paymentScheduleId debe ser un UUID válido')
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Schema de validación para sincronización batch offline.
 * POST /api/v1/payments/batch
 */
const batchSyncSchema = z.object({
  payments: z
    .array(batchItemSchema, { required_error: 'payments es obligatorio' })
    .min(1, 'Debe enviar al menos un pago')
    .max(50, 'Máximo 50 pagos por lote'),
});

export { registerPaymentSchema, batchSyncSchema, batchItemSchema };
