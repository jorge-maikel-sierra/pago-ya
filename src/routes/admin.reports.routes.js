import { Router } from 'express';
import { getReports } from '../controllers/admin.controller.js';
import { exportReport } from '../controllers/report.controller.js';

// ============================================
// Admin Reports Router — Pago Ya
// Ruta base (montaje): /admin/reports
// ============================================

const router = Router();

router.get('/', getReports);
// El formato va en query param (?format=xlsx|pdf) — no identifica un recurso,
// es un modificador de presentación del mismo reporte.
router.get('/export', exportReport);

export default router;
