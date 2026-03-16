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

import env from './config/env.js';
import redisClient from './config/redis.js';
import errorHandler from './middleware/errorHandler.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';
import authRoutes from './routes/auth.routes.js';

// Database health check
import { getDatabaseHealth, getUsersHealth } from './controllers/health.controller.js';

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
    origin: env.CORS_ORIGIN,
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

// Fly.io (y la mayoría de PaaS) terminan TLS en el proxy y reenvían HTTP al
// contenedor. Sin trust proxy Express no marca la conexión como segura y las
// cookies con secure:true nunca se envían al navegador.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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
    store: sessionStore, // undefined → MemoryStore automático
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.NODE_ENV === 'production',
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
ejs.renderFile = function ejsGuardedRenderFile(...rawArgs) {
  // args: [path, data, options?, cb?] como Express los envía
  const args = [...rawArgs];
  const data = args[1] || {};

  let optsIndex = null;
  if (args.length === 4) {
    optsIndex = 2;
  } else if (typeof args[2] === 'object') {
    optsIndex = 2;
  }

  if (optsIndex !== null) {
    const opts = args[optsIndex] || {};
    if (typeof opts.legacyInclude === 'undefined') opts.legacyInclude = true;
    if (typeof opts.client === 'undefined') opts.client = false;
    args[optsIndex] = opts;
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

  res.render = (view, options, callback) => {
    const safeOptions = options || {};
    const hadLocalsInclude =
      Object.prototype.hasOwnProperty.call(res.locals, 'include') || 'include' in res.locals;
    const hadOptionsInclude =
      Object.prototype.hasOwnProperty.call(safeOptions, 'include') || 'include' in safeOptions;

    if (hadLocalsInclude) {
      delete res.locals.include;
    }
    if (hadOptionsInclude) {
      delete safeOptions.include;
    }
    return originalRender(view, safeOptions, callback);
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
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/health/db', getDatabaseHealth);
app.get('/api/health/users', getUsersHealth);

app.use('/admin', adminRoutes);
// Rutas de autenticación públicas (login / register)
app.use('/', authRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/users', userRoutes);

// --- Ruta 404 ---
// Responde HTML al panel EJS y JSON a la API — igual que el errorHandler.
app.use((req, res) => {
  const statusCode = 404;
  const message = `Ruta ${req.originalUrl} no encontrada`;

  if (req.accepts(['html', 'json']) === 'html') {
    return res.status(statusCode).render('error', {
      title: `Error ${statusCode}`,
      statusCode,
      message,
      errors: [],
      stack: undefined,
      user: req.user || { firstName: '', lastName: '', role: 'ADMIN' },
      currentPath: '',
    });
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
});

// ============================================
// MIDDLEWARE DE ERRORES (siempre al final)
// ============================================

app.use(errorHandler);

export default app;
