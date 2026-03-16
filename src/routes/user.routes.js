import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from '../schemas/user.schema.js';
import * as userController from '../controllers/user.controller.js';

// ============================================
// User Routes — Pago Ya
// Ruta base: /api/v1/users
// ============================================

const router = Router();

// --- Estadísticas (específico antes de /:id) ---
router.get(
  '/stats/roles',
  verifyToken,
  authorize('SUPER_ADMIN', 'ADMIN'),
  userController.getUserStats,
);

// --- CRUD de usuarios ---
router.get('/', verifyToken, authorize('SUPER_ADMIN', 'ADMIN'), userController.listUsers);
router.get('/:id', verifyToken, authorize('SUPER_ADMIN', 'ADMIN'), userController.getUser);
router.post(
  '/',
  verifyToken,
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createUserSchema),
  userController.createUser,
);
router.put(
  '/:id',
  verifyToken,
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateUserSchema),
  userController.updateUser,
);
router.patch(
  '/:id/password',
  verifyToken,
  validate(changePasswordSchema),
  userController.changePassword,
);
router.delete(
  '/:id',
  verifyToken,
  authorize('SUPER_ADMIN', 'ADMIN'),
  userController.deactivateUser,
);

export default router;
