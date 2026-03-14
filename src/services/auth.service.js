import prisma from '../config/prisma.js';
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
    const err = new Error('Ya existe una cuenta con ese correo');
    err.statusCode = 400;
    throw err;
  }

  const orgName = `${firstName} ${lastName || ''}`.trim() || normalizedEmail;
  const organization = await prisma.organization.create({ data: { name: orgName } });

  const user = await userService.createUser(organization.id, {
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
    email: normalizedEmail,
    password,
    role: 'SUPER_ADMIN',
  });

  return { organization, user };
};
