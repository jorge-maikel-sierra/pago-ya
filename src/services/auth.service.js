import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import * as userService from './user.service.js';

/**
 * Registra una nueva organización y un usuario SUPER_ADMIN asociado.
 * Evita duplicados por email.
 *
 * @param {{ firstName: string, lastName?: string, email: string, password: string }} data
 * @returns {Promise<object>} Usuario creado (campos públicos)
 */
export const registerOrganizationAndUser = async (data) => {
  const { firstName, lastName, email, password } = data;

  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await userService.findUserByEmailForAuth(normalizedEmail);
  if (existing) {
    const err = new Error('Ya existe una cuenta con ese correo electrónico');
    err.statusCode = 400;
    throw err;
  }

  const orgName = `${firstName} ${lastName || ''}`.trim() || normalizedEmail;

  try {
    const organization = await prisma.organization.create({
      data: { name: orgName },
    });

    const user = await userService.createUser(organization.id, {
      firstName: firstName.trim(),
      lastName: (lastName || '').trim(),
      email: normalizedEmail,
      password,
      role: 'SUPER_ADMIN',
    });

    return { organization, user };
  } catch (error) {
    console.error('[AuthService] Error en proceso de registro:', {
      message: error.message,
      code: error.code,
    });

    // Re-lanzar errores de Prisma con mensajes amigables
    if (error.code === 'P2002') {
      const err = new Error('Este email ya está registrado');
      err.statusCode = 400;
      throw err;
    }

    throw error;
  }
};

/**
 * Valida las credenciales de un usuario administrador y retorna los datos de sesión.
 * Solo permite el acceso a roles SUPER_ADMIN y ADMIN.
 *
 * @param {string} email - Correo electrónico del usuario
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<object>} Datos del usuario sin passwordHash, listos para la sesión
 * @throws {Error} Con statusCode 401 si las credenciales son inválidas
 * @throws {Error} Con statusCode 403 si la cuenta está inactiva o el rol no tiene acceso
 */
export const loginAdminUser = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      organizationId: true,
      role: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      passwordHash: true,
    },
  });

  const isValidPassword = user && (await bcrypt.compare(password, user.passwordHash));
  if (!isValidPassword) {
    const err = new Error('Credenciales inválidas');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Cuenta desactivada. Contacte al administrador');
    err.statusCode = 403;
    throw err;
  }

  // Solo administradores pueden acceder al panel web
  const allowedRoles = ['SUPER_ADMIN', 'ADMIN'];
  if (!allowedRoles.includes(user.role)) {
    const err = new Error('Acceso denegado. Solo administradores');
    err.statusCode = 403;
    throw err;
  }

  const { passwordHash: _removed, ...sessionUser } = user;
  return sessionUser;
};

/**
 * Genera un access token JWT de 1h (configurable por env) usando JWT_SECRET.
 * @param {string} userId
 * @returns {string}
 */
export const generateAccessToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET || env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || env.JWT_EXPIRES_IN,
  });

/**
 * Genera un refresh token JWT de al menos 7d usando JWT_REFRESH_SECRET.
 * @param {string} userId
 * @returns {string}
 */
export const generateRefreshToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || env.JWT_REFRESH_EXPIRES_IN,
  });
