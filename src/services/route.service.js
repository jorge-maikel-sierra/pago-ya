import prisma from '../config/prisma.js';

/**
 * Lista las rutas de cobro de una organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<Array>}
 */
export const findRoutes = async (organizationId) =>
  prisma.route.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      collector: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { clients: true } },
    },
  });

/**
 * Búsqueda tipo typeahead de rutas de cobro.
 * Busca por name o por id/code parcial (si existe código almacenado en name o descripción).
 *
 * @param {string} organizationId
 * @param {string} q
 * @param {number} [limit=15]
 * @returns {Promise<Array>}
 */
export const searchRoutes = async (organizationId, q, limit = 15) => {
  if (!q || q.trim() === '') return [];
  const term = q.trim();

  return prisma.route.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true },
  });
};
