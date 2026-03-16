import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';

// ============================================
// User Service — Pago Ya
// Toda la lógica de negocio y queries Prisma
// para el modelo User viven aquí.
// ============================================

const SALT_ROUNDS = 12;

/** Campos públicos del usuario (sin passwordHash) */
const USER_PUBLIC_SELECT = {
  id: true,
  organizationId: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

// ──────────────────────────────────────────────
// Consultas de lectura
// ──────────────────────────────────────────────

/**
 * Obtiene un usuario activo por ID para la validación del token JWT.
 * Retorna null si el usuario no existe — el middleware decide cómo responder.
 *
 * @param {string} id - UUID del usuario (sub del JWT)
 * @returns {Promise<object|null>}
 */
export const findActiveUserById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      role: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
    },
  });
};

/**
 * Lista todos los usuarios de una organización con paginación.
 * El service calcula skip/take para mantener la lógica de paginación fuera del controller.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ role?: string, isActive?: boolean, page?: number, limit?: number }} [filters]
 * @returns {Promise<Array>}
 */
export const findAllUsers = async (organizationId, filters = {}) => {
  const { role, isActive, page = 1, limit = 50 } = filters;
  const skip = (page - 1) * limit;

  return prisma.user.findMany({
    where: {
      organizationId,
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
    },
    select: USER_PUBLIC_SELECT,
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    skip,
    take: limit,
  });
};

/**
 * Obtiene un usuario por ID dentro de una organización.
 * Lanza error si no existe.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<object>}
 */
export const findUserById = async (id, organizationId) => {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      ...USER_PUBLIC_SELECT,
      organization: { select: { id: true, name: true } },
    },
  });
};

/**
 * Busca un usuario por email (para autenticación).
 * Incluye passwordHash — usar solo en flujos de auth.
 *
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export const findUserByEmailForAuth = async (email) => {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      ...USER_PUBLIC_SELECT,
      passwordHash: true,
    },
  });
};

// ──────────────────────────────────────────────
// Mutaciones
// ──────────────────────────────────────────────

/**
 * Crea un nuevo usuario en la organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ firstName: string, lastName: string, email: string, password: string, role: string, phone?: string }} data
 * @returns {Promise<object>} Usuario creado (sin passwordHash)
 */
export const createUser = async (organizationId, data) => {
  const { password, ...rest } = data;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  return prisma.user.create({
    data: {
      ...rest,
      organizationId,
      passwordHash,
      email: rest.email.toLowerCase().trim(),
    },
    select: USER_PUBLIC_SELECT,
  });
};

/**
 * Actualiza los datos de un usuario.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización (scope de seguridad)
 * @param {{ firstName?: string, lastName?: string, phone?: string, role?: string, isActive?: boolean }} data
 * @returns {Promise<object>} Usuario actualizado
 */
export const updateUser = async (id, organizationId, data) => {
  // Verificar que el usuario pertenece a la organización antes de actualizar
  await prisma.user.findFirstOrThrow({ where: { id, organizationId } });

  return prisma.user.update({
    where: { id },
    data,
    select: USER_PUBLIC_SELECT,
  });
};

/**
 * Cambia la contraseña de un usuario.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización
 * @param {string} currentPassword - Contraseña actual en texto plano
 * @param {string} newPassword - Nueva contraseña en texto plano
 * @returns {Promise<{ success: boolean }>}
 */
export const changePassword = async (id, organizationId, currentPassword, newPassword) => {
  const user = await prisma.user.findFirstOrThrow({
    where: { id, organizationId },
    select: { passwordHash: true },
  });

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    const err = new Error('La contraseña actual es incorrecta');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  return { success: true };
};

/**
 * Desactiva (soft-delete) un usuario de la organización.
 * No elimina el registro para preservar historial de pagos e incidentes.
 *
 * @param {string} id - UUID del usuario
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<object>} Usuario desactivado
 */
export const deactivateUser = async (id, organizationId) => {
  await prisma.user.findFirstOrThrow({ where: { id, organizationId } });

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: USER_PUBLIC_SELECT,
  });
};

/**
 * Cuenta los usuarios de una organización por rol.
 *
 * @param {string} organizationId
 * @returns {Promise<{ ADMIN: number, COLLECTOR: number }>}
 */
export const countUsersByRole = async (organizationId) => {
  const counts = await prisma.user.groupBy({
    by: ['role'],
    where: { organizationId, isActive: true },
    _count: { id: true },
  });

  return counts.reduce((acc, row) => {
    acc[row.role] = row._count.id;
    return acc;
  }, {});
};
