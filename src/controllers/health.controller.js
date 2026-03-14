import prisma from '../config/prisma.js';

/**
 * GET /api/health/db
 * Endpoint de diagnóstico para verificar el estado de la base de datos
 */
export const getDatabaseHealth = async (req, res) => {
  try {
    // 1. Verificar conexión básica
    await prisma.$connect();
    
    // 2. Contar tablas principales
    const [userCount, orgCount, migrationStatus] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      // Verificar el estado de las migraciones
      prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations'`
    ]);

    // 3. Obtener info de las migraciones
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, applied_steps_count 
      FROM "_prisma_migrations" 
      ORDER BY finished_at DESC 
      LIMIT 5
    `;

    // 4. Verificar estructura de tablas principales
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    return res.json({
      success: true,
      database: {
        connected: true,
        userCount,
        organizationCount: orgCount,
        migrations: {
          tableExists: migrationStatus.length > 0,
          recent: migrations
        },
        tables: tables.map(t => t.table_name)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[DB Health Check] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * GET /api/health/users
 * Endpoint de diagnóstico para listar usuarios (solo con clave especial)
 */
export const getUsersHealth = async (req, res) => {
  try {
    const debugKey = req.query.key;
    if (debugKey !== 'debug123') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10 // Limitar a 10 usuarios más recientes
    });

    return res.json({
      success: true,
      users,
      count: users.length,
      total: await prisma.user.count(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Users Health Check] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};