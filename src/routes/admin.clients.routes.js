import { Router } from 'express';
import {
  getClients,
  getNewClient,
  createClient,
  getEditClient,
  updateClient,
  getClient,
  restrictClient,
} from '../controllers/admin.controller.js';
import validate from '../middleware/validate.js';
import {
  createClientMiddlewareSchema,
  updateClientMiddlewareSchema,
} from '../schemas/client.schema.js';

// ============================================
// Admin Clients Router — Pago Ya
// Ruta base (montaje): /admin/clients
// ============================================

const router = Router();

router.get('/', getClients);
router.get('/new', getNewClient);
router.post('/', validate(createClientMiddlewareSchema), createClient);
router.get('/:id/edit', getEditClient);
router.put('/:id', validate(updateClientMiddlewareSchema), updateClient);
router.get('/:id', getClient);
// PATCH expresa una modificación parcial del estado — correcto para alternar activo/restringido
router.patch('/:id/status', restrictClient);

export default router;
