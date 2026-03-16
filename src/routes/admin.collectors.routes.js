import { Router } from 'express';
import {
  getCollectors,
  getNewCollector,
  createCollector,
  getEditCollector,
  updateCollector,
} from '../controllers/admin.controller.js';
import validate from '../middleware/validate.js';
import { createCollectorSchema, updateCollectorSchema } from '../schemas/collector.schema.js';

// ============================================
// Admin Collectors Router — Pago Ya
// Ruta base (montaje): /admin/collectors
// ============================================

const router = Router();

router.get('/', getCollectors);
router.get('/new', getNewCollector);
router.post('/', validate(createCollectorSchema), createCollector);
router.get('/:id/edit', getEditCollector);
router.put('/:id', validate(updateCollectorSchema), updateCollector);

export default router;
