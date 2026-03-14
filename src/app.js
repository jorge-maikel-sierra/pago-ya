import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import ejs from 'ejs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import session from 'express-session';
import methodOverride from 'method-override';
import rateLimit from 'express-rate-limit';

import redisClient from './config/redis.js';
import errorHandler from './middleware/errorHandler.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';

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
// SESIONES
// ============================================
// Usa RedisStore cuando Redis está disponible.
// Cae a MemoryStore (express-session default) en el plan gratuito sin Redis.
// ADVERTENCIA: MemoryStore no es apto para múltiples instancias ni para
// reinicios de servidor — migrar a RedisStore cuando se active Redis.

let sessionStore;
if (redisClient) {
  // Importación dinámica para no cargar connect-redis si no hace falta
  const { default: RedisStore } = await import('connect-redis');
  sessionStore = new RedisStore({ client: redisClient });
}

app.use(
  session({
    store: sessionStore,   // undefined → MemoryStore automático
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

// Re-registrar engine EJS con guardia para detectar/limpiar `include` en data
const originalRenderFile = ejs.renderFile;
ejs.renderFile = function ejsGuardedRenderFile(...args) {
  // args: [path, data, options?, cb?] como Express los envía
  const path = args[0];
  const data = args[1] || {};
  const optsIndex = args.length === 4 ? 2 : typeof args[2] === 'object' ? 2 : null;
  if (optsIndex !== null) {
    args[optsIndex] = args[optsIndex] || {};
    if (typeof args[optsIndex].legacyInclude === 'undefined') args[optsIndex].legacyInclude = true;
    if (typeof args[optsIndex].client === 'undefined') args[optsIndex].client = false;
  } else {
    // No options provided: inject one to force legacyInclude
    args.splice(2, 0, { legacyInclude: true, client: false });
  }
  const hasInclude = Object.prototype.hasOwnProperty.call(data, 'include') || 'include' in data;

  if (hasInclude) {
    delete data.include;
  }

  return originalRenderFile.apply(ejs, args);
};
app.engine('ejs', ejs.renderFile);

// Evita que algún dato en locals/opts sobrescriba la función `include` de EJS.
// Si existe una clave `include` en res.locals o en las opciones de render,
// EJS pierde su helper y las vistas fallan con "include is not a function".
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = (view, options = {}, callback) => {
    const hadLocalsInclude =
      Object.prototype.hasOwnProperty.call(res.locals, 'include') || 'include' in res.locals;
    const hadOptionsInclude =
      options && (Object.prototype.hasOwnProperty.call(options, 'include') || 'include' in options);

    if (hadLocalsInclude) {
      delete res.locals.include;
    }
    if (hadOptionsInclude) {
      // eslint-disable-next-line no-param-reassign
      delete options.include;
    }
    return originalRender(view, options, callback);
  };

  next();
});

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
app.use('/api/v1/users', userRoutes);

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
