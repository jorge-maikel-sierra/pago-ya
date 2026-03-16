import prisma from '../config/prisma.js';

/**
 * Lista las rutas de cobro de una organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<Array>}
 */
export const findRoutes = async (organizationId) => {
  return prisma.route.findMany({
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
};
