import jwt from 'jsonwebtoken';
import { findActiveUserById } from '../services/user.service.js';

/**
 * Middleware de autenticación JWT para la API móvil/REST.
 * Lee el token del header `Authorization: Bearer <token>`,
 * lo valida con JWT_SECRET y verifica que el usuario exista y esté activo.
 * Adjunta el usuario a `req.user` para uso en controladores.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token de autenticación no proporcionado',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Delegar la consulta al service — el middleware no debe acceder a Prisma directamente
    const user = await findActiveUserById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cuenta desactivada. Contacte al administrador',
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
      });
    }

    return next(err);
  }
};

export { verifyToken };
