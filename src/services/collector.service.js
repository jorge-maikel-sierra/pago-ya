import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';

const SALT_ROUNDS = 12;

/**
 * Lista los cobradores de una organización con sus rutas asignadas
 * y los pagos recaudados en el día actual.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<Array>}
 */
export const findCollectors = async (organizationId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  return prisma.user.findMany({
    where: { organizationId, role: 'COLLECTOR' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      routes: {
        where: { isActive: true },
        select: { id: true, name: true },
      },
      payments: {
        where: { collectedAt: { gte: todayStart, lte: todayEnd } },
        select: { totalReceived: true },
      },
    },
    orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
  });
};

/**
 * Búsqueda tipo typeahead de cobradores.
 * Busca por nombre (firstName OR lastName) o por documento.
 * Asumimos que el número de cédula puede estar en `phone`; por tanto se busca ahí.
 *
 * @param {string} organizationId
 * @param {string} q
 * @param {number} [limit=15]
 * @returns {Promise<Array>}
 */
export const searchCollectors = async (organizationId, q, limit = 15) => {
  if (!q || q.trim() === '') return [];
  const term = q.trim();

  return prisma.user.findMany({
    where: {
      organizationId,
      role: 'COLLECTOR',
      isActive: true,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
};

/**
 * Obtiene un cobrador por ID verificando que pertenezca a la organización.
 * Lanza error 404 si no se encuentra.
 *
 * @param {string} id - UUID del cobrador
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<object>}
 */
export const findCollectorById = async (id, organizationId) => {
  const collector = await prisma.user.findFirst({
    where: { id, organizationId, role: 'COLLECTOR' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  });

  if (!collector) {
    const err = new Error('Cobrador no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return collector;
};

/**
 * Crea un nuevo cobrador en la organización.
 * El rol se fuerza a COLLECTOR independientemente de los datos recibidos.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ firstName: string, lastName: string, email: string,
 *   phone?: string, password: string }} data
 * @returns {Promise<import('@prisma/client').User>}
 */
export const createCollector = async (organizationId, data) => {
  const { firstName, lastName, email, phone, password } = data;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await prisma.user.create({
      data: {
        organizationId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        role: 'COLLECTOR',
        passwordHash,
        isActive: true,
      },
    });
  } catch (error) {
    // email tiene constraint única global en la tabla users (ver schema.prisma @unique)
    if (error.code === 'P2002') {
      const err = new Error('El email ya está registrado por otro usuario');
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};

/**
 * Actualiza los datos de un cobrador. Si se provee una nueva contraseña, se hashea.
 * Verifica que el cobrador pertenezca a la organización.
 *
 * @param {string} id - UUID del cobrador
 * @param {string} organizationId - UUID de la organización
 * @param {{ firstName: string, lastName: string, email: string,
 *   phone?: string, password?: string, isActive?: boolean }} data
 * @returns {Promise<import('@prisma/client').User>}
 */
export const updateCollector = async (id, organizationId, data) => {
  await prisma.user.findFirstOrThrow({
    where: { id, organizationId, role: 'COLLECTOR' },
  });

  const { firstName, lastName, email, phone, password, isActive } = data;

  const updateData = {
    firstName,
    lastName,
    email,
    phone: phone || null,
    isActive: isActive ?? true,
  };

  if (password && password.trim() !== '') {
    updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  try {
    return await prisma.user.update({ where: { id }, data: updateData });
  } catch (error) {
    if (error.code === 'P2002') {
      const err = new Error('El email ya está registrado por otro usuario');
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};
