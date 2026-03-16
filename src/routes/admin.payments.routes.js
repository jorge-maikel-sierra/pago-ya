import { Router } from 'express';
import { getPayments, getNewPayment, createPayment } from '../controllers/admin.controller.js';

// ============================================
// Admin Payments Router — Pago Ya
// Ruta base (montaje): /admin/payments
// ============================================

const router = Router();

router.get('/', getPayments);
router.get('/new', getNewPayment);
router.post('/', createPayment);

export default router;
