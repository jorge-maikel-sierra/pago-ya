import { Router } from 'express';
import { verifySession } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getLogin,
  postLogin,
  redirectToDashboard,
  getDashboard,
  getRoutes,
  getSettings,
  logout,
} from '../controllers/admin.controller.js';

import loansRouter from './admin.loans.routes.js';
import clientsRouter from './admin.clients.routes.js';
import collectorsRouter from './admin.collectors.routes.js';
import paymentsRouter from './admin.payments.routes.js';
import reportsRouter from './admin.reports.routes.js';
import usersRouter from './admin.users.routes.js';
import organizationsRouter from './admin.organizations.routes.js';

// ============================================
// Admin Router — Pago Ya
// Ruta base (montaje): /admin
//
// Este router es el orquestador del panel administrativo.
// Cada recurso tiene su propio sub-router en routes/admin.*.routes.js
// ============================================

const router = Router();

// ============================================
// RUTAS PÚBLICAS (sin verifySession)
// ============================================

router.get('/login', getLogin);
router.post('/login', postLogin);

// ============================================
// RUTAS PROTEGIDAS (sesión + rol ADMIN o SUPER_ADMIN)
// Todos los sub-routers heredan este middleware al ser montados aquí.
// ============================================

router.use(verifySession);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', redirectToDashboard);
router.get('/dashboard', getDashboard);

// --- Recursos del panel (cada uno con su Router propio) ---
router.use('/loans', loansRouter);
router.use('/clients', clientsRouter);
router.use('/collectors', collectorsRouter);
router.use('/payments', paymentsRouter);
router.use('/reports', reportsRouter);

// --- Rutas de cobro (sin sub-recursos propios) ---
router.get('/routes', getRoutes);

// --- Configuración ---
router.get('/settings', getSettings);

// --- Logout ---
router.delete('/logout', logout);

// --- Recursos exclusivos SUPER_ADMIN ---
router.use('/users', usersRouter);
router.use('/organizations', organizationsRouter);

export default router;
