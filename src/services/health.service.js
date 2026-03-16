import prisma from '../config/prisma.js';

/**
 * Verifica el estado de la base de datos ejecutando queries de diagnóstico.
 * Incluye conteo de entidades, estado de migraciones y listado de tablas públicas.
 *
 * Se usa $queryRaw porque la información de migraciones y esquema vive en tablas
 * del sistema que Prisma no expone a través de su API fluent.
 *
 * @returns {Promise<{
 *   userCount: number,
 *   orgCount: number,
 *   migrationStatus: Array,
 *   migrations: Array,
 *   tables: Array
 * }>}
 */
export const getDatabaseStatus = async () => {
  await prisma.$connect();

  try {
    const [userCount, orgCount, migrationStatus, migrations, tables] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      // Verifica si la tabla de migraciones de Prisma existe en el esquema público
      prisma.$queryRaw`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      `,
      // Lista las 5 migraciones más recientes para diagnóstico de despliegue
      prisma.$queryRaw`
        SELECT migration_name, finished_at, applied_steps_count
        FROM "_prisma_migrations"
        ORDER BY finished_at DESC
        LIMIT 5
      `,
      // Lista todas las tablas del esquema público para validar la estructura del DB
      prisma.$queryRaw`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
    ]);

    return { userCount, orgCount, migrationStatus, migrations, tables };
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * Obtiene los 10 usuarios más recientes para diagnóstico.
 * Protegido por clave en el controlador — no exponer en producción sin auth.
 *
 * @returns {Promise<{ users: Array, total: number }>}
 */
export const getRecentUsers = async () => {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.user.count(),
  ]);

  return { users, total };
};
