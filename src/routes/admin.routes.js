import { Router } from 'express';
import { verifySession } from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getLogin,
  postLogin,
  getDashboard,
  getLoans,
  getNewLoan,
  previewLoan,
  createLoan,
  getLoan,
  getClients,
  getClient,
  getNewClient,
  createClient,
  getEditClient,
  updateClient,
  restrictClient,
  getCollectors,
  getNewCollector,
  createCollector,
  getEditCollector,
  updateCollector,
  getPayments,
  getNewPayment,
  createPayment,
  getRoutes,
  getReports,
  getSettings,
  getUsers,
  getNewUser,
  createUser,
  getEditUser,
  updateUser,
  getOrganizations,
  getNewOrganization,
  createOrganization,
  logout,
} from '../controllers/admin.controller.js';
import { exportReport } from '../controllers/report.controller.js';
import validate from '../middleware/validate.js';
import { createOrganizationSchema } from '../schemas/organization.schema.js';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema.js';
import {
  createClientMiddlewareSchema,
  updateClientMiddlewareSchema,
} from '../schemas/client.schema.js';
import { createCollectorSchema, updateCollectorSchema } from '../schemas/collector.schema.js';

const router = Router();

// ============================================
// RUTAS PÚBLICAS (sin verifySession)
// ============================================

router.get('/login', getLogin);
router.post('/login', postLogin);

// ============================================
// RUTAS PROTEGIDAS (sesión + rol ADMIN o SUPER_ADMIN)
// ============================================

router.use(verifySession);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', getDashboard);

// --- Préstamos ---
router.get('/loans', getLoans);
router.get('/loans/new', getNewLoan);
router.post('/loans/preview', previewLoan);
router.post('/loans', createLoan);
router.get('/loans/:id', getLoan);

// --- Clientes ---
router.get('/clients', getClients);
router.get('/clients/new', getNewClient);
router.post('/clients', validate(createClientMiddlewareSchema), createClient);
router.get('/clients/:id/edit', getEditClient);
router.put('/clients/:id', validate(updateClientMiddlewareSchema), updateClient);
router.get('/clients/:id', getClient);
// PATCH expresa una modificación parcial del estado — correcto para alternar activo/restringido
router.patch('/clients/:id/status', restrictClient);

// --- Cobradores ---
router.get('/collectors', getCollectors);
router.get('/collectors/new', getNewCollector);
router.post('/collectors', validate(createCollectorSchema), createCollector);
router.get('/collectors/:id/edit', getEditCollector);
router.put('/collectors/:id', validate(updateCollectorSchema), updateCollector);

// --- Rutas de cobro ---
router.get('/routes', getRoutes);

// --- Pagos ---
router.get('/payments', getPayments);
router.get('/payments/new', getNewPayment);
router.post('/payments', createPayment);

// --- Reportes ---
router.get('/reports', getReports);
router.get('/reports/export/:format', exportReport);

// --- Configuración ---

router.get('/settings', getSettings);

// --- Logout ---
router.delete('/logout', logout);

// ============================================
// RUTAS SUPER_ADMIN (solo SUPER_ADMIN)
// ============================================

// --- Usuarios ---
router.get('/users', authorize('SUPER_ADMIN'), getUsers);
router.get('/users/new', authorize('SUPER_ADMIN'), getNewUser);
router.post('/users', authorize('SUPER_ADMIN'), validate(createUserSchema), createUser);
router.get('/users/:id/edit', authorize('SUPER_ADMIN'), getEditUser);
router.put('/users/:id', authorize('SUPER_ADMIN'), validate(updateUserSchema), updateUser);

// --- Organizaciones ---
router.get('/organizations', authorize('SUPER_ADMIN'), getOrganizations);
router.get('/organizations/new', authorize('SUPER_ADMIN'), getNewOrganization);
router.post(
  '/organizations',
  authorize('SUPER_ADMIN'),
  validate(createOrganizationSchema),
  createOrganization,
);

export default router;
