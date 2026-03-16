import { Router } from 'express';
import authorize from '../middleware/authorize.js';
import {
  getUsers,
  getNewUser,
  createUser,
  getEditUser,
  updateUser,
} from '../controllers/admin.controller.js';
import validate from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema.js';

// ============================================
// Admin Users Router — Pago Ya
// Ruta base (montaje): /admin/users
// Acceso exclusivo: SUPER_ADMIN
// ============================================

const router = Router();

router.get('/', authorize('SUPER_ADMIN'), getUsers);
router.get('/new', authorize('SUPER_ADMIN'), getNewUser);
router.post('/', authorize('SUPER_ADMIN'), validate(createUserSchema), createUser);
router.get('/:id/edit', authorize('SUPER_ADMIN'), getEditUser);
router.put('/:id', authorize('SUPER_ADMIN'), validate(updateUserSchema), updateUser);

export default router;
