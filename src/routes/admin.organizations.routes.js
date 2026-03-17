import { Router } from 'express';
import authorize from '../middleware/authorize.js';
import {
  getOrganizations,
  getNewOrganization,
  createOrganization,
  getEditOrganization,
  updateOrganization,
} from '../controllers/admin.controller.js';
import validate from '../middleware/validate.js';
import { createOrganizationSchema, updateOrganizationSchema } from '../schemas/organization.schema.js';

// ============================================
// Admin Organizations Router — Pago Ya
// Ruta base (montaje): /admin/organizations
// Acceso exclusivo: SUPER_ADMIN
// ============================================

const router = Router();

router.get('/', authorize('SUPER_ADMIN'), getOrganizations);
router.get('/new', authorize('SUPER_ADMIN'), getNewOrganization);
router.post('/', authorize('SUPER_ADMIN'), validate(createOrganizationSchema), createOrganization);
router.get('/:id/edit', authorize('SUPER_ADMIN'), getEditOrganization);

// PUT via method-override desde el formulario HTML (?_method=PUT)
router.put('/:id', authorize('SUPER_ADMIN'), validate(updateOrganizationSchema), updateOrganization);

export default router;
