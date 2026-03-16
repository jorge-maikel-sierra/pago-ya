import { Router } from 'express';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { registerPaymentSchema, batchSyncSchema } from '../validators/payment.validator.js';
import { registerPaymentHandler, batchSyncHandler } from '../controllers/payment.controller.js';

const router = Router();

router.post(
  '/',
  verifyToken,
  authorize('COLLECTOR', 'ADMIN', 'SUPER_ADMIN'),
  validate(z.object({ body: registerPaymentSchema })),
  registerPaymentHandler,
);

router.post(
  '/batch',
  verifyToken,
  authorize('COLLECTOR', 'ADMIN', 'SUPER_ADMIN'),
  validate(z.object({ body: batchSyncSchema })),
  batchSyncHandler,
);

export default router;
