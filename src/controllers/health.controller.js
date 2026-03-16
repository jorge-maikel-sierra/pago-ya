import asyncHandler from '../utils/asyncHandler.js';
import { getDatabaseStatus, getRecentUsers } from '../services/health.service.js';
import env from '../config/env.js';

/**
 * GET /api/health/db
 * Devuelve el estado de la base de datos: conexión, conteo de entidades,
 * historial de migraciones recientes y listado de tablas del esquema público.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getDatabaseHealth = asyncHandler(async (req, res) => {
  const { userCount, orgCount, migrationStatus, migrations, tables } = await getDatabaseStatus();

  return res.json({
    success: true,
    database: {
      connected: true,
      userCount,
      organizationCount: orgCount,
      migrations: {
        tableExists: migrationStatus.length > 0,
        recent: migrations,
      },
      tables: tables.map((t) => t.table_name),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/users
 * Lista los 10 usuarios más recientes. Solo accesible con clave de debug.
 * SECURITY: Esta ruta debe eliminarse o protegerse con auth real antes de producción.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getUsersHealth = asyncHandler(async (req, res) => {
  // Ruta de diagnóstico solo disponible en entornos no productivos y cuando
  // DEBUG_KEY está definido. Si DEBUG_KEY no existe o la app está en
  // producción, siempre retorna 403 — evita acceso accidental por variable undefined.
  const debugKey = env.DEBUG_KEY;
  if (!debugKey || env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'No autorizado' });
  }
  if (req.query.key !== debugKey) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const { users, total } = await getRecentUsers();

  return res.json({
    success: true,
    users,
    count: users.length,
    total,
    timestamp: new Date().toISOString(),
  });
});
