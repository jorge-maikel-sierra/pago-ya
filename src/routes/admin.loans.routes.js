import { Router } from 'express';
import {
  getLoans,
  getNewLoan,
  previewLoan,
  createLoan,
  getLoan,
} from '../controllers/admin.controller.js';

// ============================================
// Admin Loans Router — Pago Ya
// Ruta base (montaje): /admin/loans
// ============================================

const router = Router();

router.get('/', getLoans);
router.get('/new', getNewLoan);
// POST /preview no persiste — devuelve JSON del cronograma calculado
router.post('/preview', previewLoan);
router.post('/', createLoan);
router.get('/:id', getLoan);

export default router;
