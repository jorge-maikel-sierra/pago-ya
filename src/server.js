import 'dotenv/config';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

import app from './app.js';
import prisma from './config/prisma.js';
import redisClient from './config/redis.js';
import { initTelegramBot } from './config/telegram.js';
import startTelegramWorker from './jobs/telegramWorker.js';
import startMoraWorker from './jobs/moraWorker.js';
import startPdfWorker from './jobs/pdfWorker.js';

// ============================================
// CONFIGURACIÓN
// ============================================

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ============================================
// HTTP SERVER + SOCKET.IO
// ============================================

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Exponer io en la app para uso en controladores / servicios
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket.io] Cliente conectado: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id} (${reason})`);
  });
});

// ============================================
// BACKGROUND WORKERS (BullMQ)
// ============================================

let telegramWorker;
let moraWorker;
let pdfWorker;

/**
 * Inicia los workers de BullMQ para procesar colas en segundo plano.
 */
const startWorkers = () => {
  telegramWorker = startTelegramWorker();
  moraWorker = startMoraWorker();
  pdfWorker = startPdfWorker();
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

/**
 * Cierra todos los recursos de forma ordenada.
 * @param {string} signal - Señal que disparó el cierre (SIGINT | SIGTERM)
 */
const shutdown = async (signal) => {
  console.log(`\n[Server] Señal ${signal} recibida. Cerrando...`);

  // 1. Dejar de aceptar nuevas conexiones HTTP
  httpServer.close(() => {
    console.log('[Server] HTTP server cerrado');
  });

  // 2. Cerrar Socket.io
  io.close(() => {
    console.log('[Server] Socket.io cerrado');
  });

  // 3. Cerrar workers de BullMQ
  try {
    if (telegramWorker) await telegramWorker.close();
    if (moraWorker) await moraWorker.close();
    if (pdfWorker) await pdfWorker.close();
    console.log('[Server] Workers cerrados');
  } catch (err) {
    console.error('[Server] Error cerrando workers:', err.message);
  }

  // 4. Desconectar Prisma
  try {
    await prisma.$disconnect();
    console.log('[Server] Prisma desconectado');
  } catch (err) {
    console.error('[Server] Error desconectando Prisma:', err.message);
  }

  // 5. Desconectar Redis
  try {
    await redisClient.quit();
    console.log('[Server] Redis desconectado');
  } catch (err) {
    console.error('[Server] Error desconectando Redis:', err.message);
  }

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============================================
// ARRANQUE
// ============================================

/**
 * Conecta dependencias e inicia el servidor HTTP.
 * @returns {Promise<void>}
 */
const startServer = async () => {
  try {
    // Conectar Prisma (verifica conexión a PostgreSQL)
    await prisma.$connect();
    console.log('[Server] ✓ PostgreSQL conectado');

    // Conectar Redis (si no lo conectó BullMQ antes)
    if (redisClient.status === 'wait') {
      await redisClient.connect();
    }
    console.log('[Server] ✓ Redis conectado');

    // Iniciar workers de BullMQ
    startWorkers();
    console.log('[Server] ✓ Workers iniciados');

    // Inicializar bot de Telegram
    initTelegramBot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
      isProduction: process.env.NODE_ENV === 'production',
    });
    console.log('[Server] ✓ Telegram configurado');

    // Levantar servidor HTTP
    httpServer.listen(PORT, () => {
      console.log(`[Server] ✓ Escuchando en http://localhost:${PORT}`);
      console.log(`[Server]   Entorno: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[Server] Error fatal al iniciar:', err);
    process.exit(1);
  }
};

startServer();
