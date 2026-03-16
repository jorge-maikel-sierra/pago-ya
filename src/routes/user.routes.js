import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
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
router.post('/', verifyToken, authorize('SUPER_ADMIN', 'ADMIN'), userController.createUser);
router.put('/:id', verifyToken, authorize('SUPER_ADMIN', 'ADMIN'), userController.updateUser);
router.patch('/:id/password', verifyToken, userController.changePassword);
router.delete(
  '/:id',
  verifyToken,
  authorize('SUPER_ADMIN', 'ADMIN'),
  userController.deactivateUser,
);

export default router;
