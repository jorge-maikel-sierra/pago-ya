import asyncHandler from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';
import * as apiResponse from '../utils/apiResponse.js';

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
  const { organizationId } = req.user;
  const { role, isActive, page = 1, limit = 50 } = req.query;

  // Pasar page/limit como números al service — el service calcula skip/take internamente
  const users = await userService.findAllUsers(organizationId, {
    role,
    isActive,
    page: Number(page),
    limit: Number(limit),
  });
  return apiResponse.success(res, users);
});

/**
 * GET /api/v1/users/:userId
 * Obtiene el detalle de un usuario por ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.user;
  const { userId } = req.params;

  const user = await userService.findUserById(userId, organizationId);
  return apiResponse.success(res, user);
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
  const { organizationId } = req.user;

  // req.body ya fue validado por validate(createUserSchema) en la ruta
  const user = await userService.createUser(organizationId, req.body);
  return apiResponse.success(res, user, 201);
});

/**
 * PUT /api/v1/users/:userId
 * Actualiza los datos de un usuario.
 * Solo accesible por ADMIN y SUPER_ADMIN.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.user;
  const { userId } = req.params;

  // req.body ya fue validado por validate(updateUserSchema) en la ruta
  const user = await userService.updateUser(userId, organizationId, req.body);
  return apiResponse.success(res, user);
});

/**
 * PATCH /api/v1/users/:userId/password
 * Cambia la contraseña de un usuario.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { organizationId } = req.user;
  const { userId } = req.params;

  // req.body ya fue validado por validate(changePasswordSchema) en la ruta
  const { currentPassword, newPassword } = req.body;

  const result = await userService.changePassword(
    userId,
    organizationId,
    currentPassword,
    newPassword,
  );
  return apiResponse.success(res, result);
});

/**
 * DELETE /api/v1/users/:userId
 * Desactiva (soft-delete) un usuario.
 * Solo accesible por ADMIN y SUPER_ADMIN.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const { organizationId } = req.user;
  const { userId } = req.params;

  const user = await userService.deactivateUser(userId, organizationId);
  return apiResponse.success(res, user);
});

/**
 * GET /api/v1/users/stats/roles
 * Retorna el conteo de usuarios por rol en la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getUserStats = asyncHandler(async (req, res) => {
  const { organizationId } = req.user;
  const stats = await userService.countUsersByRole(organizationId);
  return apiResponse.success(res, stats);
});
