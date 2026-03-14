import asyncHandler from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';
import * as apiResponse from '../utils/apiResponse.js';
import { createUserSchema, updateUserSchema, changePasswordSchema } from '../schemas/user.schema.js';

// ============================================
// User Controller — Pago Ya
// Solo lógica de request/response.
// Toda la lógica de negocio está en user.service.js
// ============================================

/**
 * GET /api/v1/users
 * Lista los usuarios de la organización del usuario autenticado.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const { role, isActive, page = 1, limit = 50 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const filters = {
    ...(role && { role }),
    ...(isActive !== undefined && { isActive: isActive === 'true' }),
    skip,
    take: Number(limit),
  };

  const users = await userService.findAllUsers(organizationId, filters);
  return apiResponse.success(res, users, 'Usuarios obtenidos correctamente');
});

/**
 * GET /api/v1/users/:id
 * Obtiene el detalle de un usuario por ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const { id } = req.params;

  const user = await userService.findUserById(id, organizationId);
  return apiResponse.success(res, user, 'Usuario obtenido correctamente');
});

/**
 * POST /api/v1/users
 * Crea un nuevo usuario en la organización.
 * Solo accesible por ADMIN y SUPER_ADMIN.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const createUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;

  // Validación Zod — lanza ZodError si falla (capturado por errorHandler)
  const data = createUserSchema.shape.body.parse(req.body);

  const user = await userService.createUser(organizationId, data);
  return apiResponse.success(res, user, 'Usuario creado correctamente', 201);
});

/**
 * PUT /api/v1/users/:id
 * Actualiza los datos de un usuario.
 * Solo accesible por ADMIN y SUPER_ADMIN.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const { id } = req.params;

  const data = updateUserSchema.shape.body.parse(req.body);

  const user = await userService.updateUser(id, organizationId, data);
  return apiResponse.success(res, user, 'Usuario actualizado correctamente');
});

/**
 * PATCH /api/v1/users/:id/password
 * Cambia la contraseña de un usuario.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const { id } = req.params;

  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const result = await userService.changePassword(id, organizationId, currentPassword, newPassword);
  return apiResponse.success(res, result, 'Contraseña actualizada correctamente');
});

/**
 * DELETE /api/v1/users/:id
 * Desactiva (soft-delete) un usuario.
 * Solo accesible por ADMIN y SUPER_ADMIN.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const { id } = req.params;

  const user = await userService.deactivateUser(id, organizationId);
  return apiResponse.success(res, user, 'Usuario desactivado correctamente');
});

/**
 * GET /api/v1/users/stats/roles
 * Retorna el conteo de usuarios por rol en la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getUserStats = asyncHandler(async (req, res) => {
  const { organizationId } = req.session.user;
  const stats = await userService.countUsersByRole(organizationId);
  return apiResponse.success(res, stats, 'Estadísticas de usuarios obtenidas');
});
