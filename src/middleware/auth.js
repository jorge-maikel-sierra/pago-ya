import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

/**
 * Middleware de autenticación JWT para la API móvil.
 * Lee el token del header `Authorization: Bearer <token>`,
 * lo valida con JWT_SECRET, y verifica que el usuario exista y esté activo.
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

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
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

/**
 * Middleware de autenticación por sesión para el panel de administración EJS.
 * Verifica que exista `req.session.user`; si no, redirige a la página de login.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifySession = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }

  req.user = req.session.user;
  return next();
};

export { verifyToken, verifySession };
