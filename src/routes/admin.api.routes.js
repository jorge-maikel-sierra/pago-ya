import { Router } from 'express';
import { verifySession } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

// Protegemos estas APIs con sesión y rol ADMIN/SUPER_ADMIN
router.use(verifySession);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/customers/search', adminController.searchCustomers);
router.get('/collectors/search', adminController.searchCollectors);
router.get('/collection_routes/search', adminController.searchRoutes);

export default router;
