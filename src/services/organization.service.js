import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';

const SALT_ROUNDS = 12;

/**
 * Lista las organizaciones del sistema con búsqueda opcional.
 * Solo accesible por SUPER_ADMIN.
 *
 * @param {{ search?: string }} [filters]
 * @returns {Promise<Array>}
 */
export const findOrganizations = async ({ search } = {}) => {
  /** @type {import('@prisma/client').Prisma.OrganizationWhereInput} */
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nit: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  return prisma.organization.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      nit: true,
      logoUrl: true,
      planType: true,
      subscriptionEnds: true,
      moraGraceDays: true,
      moraMultiplier: true,
      isActive: true,
      createdAt: true,
      _count: { select: { users: true, loans: true } },
    },
  });
};

/**
 * Crea una nueva organización en el sistema.
 *
 * @param {object} data - Datos de la organización del formulario
 * @returns {Promise<import('@prisma/client').Organization>}
 */
export const createOrganization = async (data) => {
  const {
    name,
    nit,
    phone,
    email,
    address,
    logoUrl,
    planType,
    subscriptionEnds,
    moraGraceDays,
    moraMultiplier,
    isActive,
  } = data;

  try {
    return await prisma.organization.create({
      data: {
        name,
        nit: nit || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        logoUrl: logoUrl || null,
        planType: planType || 'BASIC',
        subscriptionEnds: subscriptionEnds ? new Date(subscriptionEnds) : null,
        moraGraceDays: moraGraceDays ?? 0,
        moraMultiplier: moraMultiplier ?? 1.5,
        isActive: isActive ?? true,
      },
    });
  } catch (error) {
    // nit y email tienen constraint única en la tabla organizations (ver schema.prisma @unique)
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'campo';
      const err = new Error(`El ${field} ya está registrado en otra organización`);
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};

/**
 * Obtiene una organización por su ID para edición.
 * Lanza un error 404 operacional si no existe.
 *
 * @param {string} id - UUID de la organización
 * @returns {Promise<import('@prisma/client').Organization>}
 */
export const findOrganizationById = async (id) => {
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      nit: true,
      phone: true,
      email: true,
      address: true,
      logoUrl: true,
      planType: true,
      subscriptionEnds: true,
      moraGraceDays: true,
      moraMultiplier: true,
      isActive: true,
    },
  });

  if (!organization) {
    const err = new Error('Organización no encontrada');
    err.statusCode = 404;
    err.isOperational = true;
    throw err;
  }

  return organization;
};

/**
 * Actualiza los datos de una organización existente.
 * Lanza un error 404 si la organización no existe y 409 si el nit/email ya están en uso.
 *
 * @param {string} id - UUID de la organización
 * @param {object} data - Campos a actualizar (mismos que createOrganization)
 * @returns {Promise<import('@prisma/client').Organization>}
 */
export const updateOrganization = async (id, data) => {
  // Verificar existencia antes de actualizar para retornar 404 claro
  await prisma.organization.findUniqueOrThrow({ where: { id } });

  const {
    name,
    nit,
    phone,
    email,
    address,
    logoUrl,
    planType,
    subscriptionEnds,
    moraGraceDays,
    moraMultiplier,
    isActive,
  } = data;

  try {
    return await prisma.organization.update({
      where: { id },
      data: {
        name,
        nit: nit || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        logoUrl: logoUrl || null,
        planType: planType || 'BASIC',
        subscriptionEnds: subscriptionEnds ? new Date(subscriptionEnds) : null,
        moraGraceDays: moraGraceDays ?? 0,
        moraMultiplier: moraMultiplier ?? 1.5,
        isActive: isActive ?? true,
      },
    });
  } catch (error) {
    // nit y email tienen constraint única en la tabla organizations (ver schema.prisma @unique)
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'campo';
      const err = new Error(`El ${field} ya está registrado en otra organización`);
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};

/**
 * Lista los usuarios de una organización con búsqueda opcional.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ search?: string }} [filters]
 * @returns {Promise<Array>}
 */
export const findOrgUsers = async (organizationId, { search } = {}) => {
  const where = {
    organizationId,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  return prisma.user.findMany({
    where,
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
};

/**
 * Obtiene un usuario para edición verificando que pertenezca a la organización.
 * Lanza error 404 si no se encuentra.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<object>}
 */
export const findOrgUserById = async (id, organizationId) => {
  const user = await prisma.user.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });

  if (!user) {
    const err = new Error('Usuario no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return user;
};

/**
 * Crea un nuevo usuario en la organización con hash de contraseña.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ firstName: string, lastName: string, email: string,
 *   phone?: string, role: string, password: string, isActive?: boolean }} data
 * @returns {Promise<import('@prisma/client').User>}
 */
export const createOrgUser = async (organizationId, data) => {
  const { firstName, lastName, email, phone, role, password, isActive } = data;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await prisma.user.create({
      data: {
        organizationId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        role,
        passwordHash,
        isActive: isActive ?? true,
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
 * Actualiza un usuario de la organización. Si se provee nueva contraseña, se hashea.
 * Verifica que el usuario pertenezca a la organización.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización
 * @param {{ firstName: string, lastName: string, email: string,
 *   phone?: string, role: string, password?: string, isActive?: boolean }} data
 * @returns {Promise<import('@prisma/client').User>}
 */
export const updateOrgUser = async (id, organizationId, data) => {
  await prisma.user.findFirstOrThrow({ where: { id, organizationId } });

  const { firstName, lastName, email, phone, role, password, isActive } = data;

  const updateData = {
    firstName,
    lastName,
    email,
    phone: phone || null,
    role,
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
