import { Router } from 'express';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { registerPaymentSchema, batchSyncSchema } from '../validators/payment.validator.js';
import { createPayment, syncPaymentsBatch } from '../controllers/payment.controller.js';

const router = Router();

router.post(
  '/',
  verifyToken,
  authorize('COLLECTOR', 'ADMIN', 'SUPER_ADMIN'),
  validate(z.object({ body: registerPaymentSchema })),
  createPayment,
);

router.post(
  '/batch',
  verifyToken,
  authorize('COLLECTOR', 'ADMIN', 'SUPER_ADMIN'),
  validate(z.object({ body: batchSyncSchema })),
  syncPaymentsBatch,
);

export default router;
