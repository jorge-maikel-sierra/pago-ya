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
  
  console.log('[AuthService] Verificando si existe usuario con email:', normalizedEmail);

  const existing = await userService.findUserByEmailForAuth(normalizedEmail);
  if (existing) {
    console.log('[AuthService] Usuario ya existe:', { email: normalizedEmail, existingId: existing.id });
    const err = new Error('Ya existe una cuenta con ese correo electrónico');
    err.statusCode = 400;
    throw err;
  }

  console.log('[AuthService] Email disponible, creando organización...');
  const orgName = `${firstName} ${lastName || ''}`.trim() || normalizedEmail;
  
  try {
    const organization = await prisma.organization.create({ 
      data: { name: orgName }
    });
    
    console.log('[AuthService] Organización creada:', { 
      id: organization.id, 
      name: organization.name 
    });

    console.log('[AuthService] Creando usuario...');
    const user = await userService.createUser(organization.id, {
      firstName: firstName.trim(),
      lastName: (lastName || '').trim(),
      email: normalizedEmail,
      password,
      role: 'SUPER_ADMIN',
    });

    console.log('[AuthService] Usuario creado exitosamente:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    });

    return { organization, user };

  } catch (error) {
    console.error('[AuthService] Error en proceso de registro:', {
      message: error.message,
      code: error.code,
      name: error.name
    });

    // Re-lanzar errores de Prisma con mensajes amigables
    if (error.code === 'P2002') {
      const err = new Error('Este email ya está registrado');
      err.statusCode = 400;
      throw err;
    }

    // Re-lanzar otros errores
    throw error;
  }
};
