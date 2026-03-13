import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import session from 'express-session';
import RedisStore from 'connect-redis';
import methodOverride from 'method-override';
import rateLimit from 'express-rate-limit';

import redisClient from './config/redis.js';
import errorHandler from './middleware/errorHandler.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';

// --- Rutas de directorio (ESM no tiene __dirname) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ============================================
// MIDDLEWARE GLOBALES
// ============================================

// --- Seguridad HTTP con Helmet + CSP para Tailwind CDN ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  }),
);

// --- CORS ---
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }),
);

// --- Compresión gzip ---
app.use(compression());

// --- Body parsers ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- Method Override (PUT/DELETE desde formularios EJS) ---
app.use(methodOverride('_method'));

// --- Rate Limiter global ---
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiadas solicitudes, intente de nuevo más tarde' },
  }),
);

// --- Archivos estáticos ---
app.use(express.static(join(__dirname, '..', 'public')));

// ============================================
// SESIONES CON REDIS
// ============================================

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: 'lax',
    },
  }),
);

// ============================================
// VIEW ENGINE (EJS)
// ============================================

app.set('view engine', 'ejs');
app.set('views', join(__dirname, '..', 'views'));
app.set('view cache', false); // Deshabilitar cache en desarrollo

// ============================================
// RUTAS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Paga Diario API funcionando correctamente',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// TODO: Registrar rutas del módulo aquí
// app.use('/api/auth', authRoutes);
// app.use('/api/loans', loanRoutes);
app.use('/admin', adminRoutes);
app.use('/api/v1/payments', paymentRoutes);

// --- Ruta 404 ---
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta ${req.originalUrl} no encontrada`,
  });
});

// ============================================
// MIDDLEWARE DE ERRORES (siempre al final)
// ============================================

app.use(errorHandler);

export default app;
