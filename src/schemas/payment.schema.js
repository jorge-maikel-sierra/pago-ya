import { z } from 'zod';

const SYNC_STATUSES = Object.freeze(['SYNCED', 'PENDING_SYNC', 'CONFLICT']);

/**
 * Schema de validación para registrar un pago individual.
 * POST /api/v1/payments
 *
 * @type {z.ZodObject}
 */
const registerPaymentSchema = z.object({
  loanId: z
    .string({ required_error: 'loanId es obligatorio' })
    .uuid('loanId debe ser un UUID válido'),
  amountPaid: z
    .number({ required_error: 'amountPaid es obligatorio' })
    .positive('amountPaid debe ser mayor a 0'),
  offlineCreatedAt: z
    .string()
    .datetime({ message: 'offlineCreatedAt debe ser una fecha ISO 8601 válida' })
    .optional(),
  paymentScheduleId: z.string().uuid('paymentScheduleId debe ser un UUID válido').optional(),
  latitude: z
    .number()
    .min(-90, 'latitude debe estar entre -90 y 90')
    .max(90, 'latitude debe estar entre -90 y 90')
    .optional(),
  longitude: z
    .number()
    .min(-180, 'longitude debe estar entre -180 y 180')
    .max(180, 'longitude debe estar entre -180 y 180')
    .optional(),
  notes: z.string().max(500, 'notes no puede superar 500 caracteres').optional(),
  deviceId: z.string().trim().max(100, 'deviceId no puede superar 100 caracteres').optional(),
  syncStatus: z
    .enum(SYNC_STATUSES, {
      errorMap: () => ({ message: `syncStatus debe ser uno de: ${SYNC_STATUSES.join(', ')}` }),
    })
    .default('SYNCED'),
});

/**
 * Schema para un ítem dentro del batch de sincronización offline.
 */
const batchItemSchema = registerPaymentSchema.extend({
  localId: z
    .string({ required_error: 'localId es obligatorio' })
    .min(1, 'localId no puede estar vacío'),
});

/**
 * Schema de validación para sincronización batch offline.
 * POST /api/v1/payments/batch-sync
 *
 * @type {z.ZodObject}
 */
const batchSyncSchema = z.object({
  payments: z
    .array(batchItemSchema, { required_error: 'payments es obligatorio' })
    .min(1, 'Debe enviar al menos un pago')
    .max(50, 'Máximo 50 pagos por lote'),
});

export { registerPaymentSchema, batchItemSchema, batchSyncSchema, SYNC_STATUSES };
