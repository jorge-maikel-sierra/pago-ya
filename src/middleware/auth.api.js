import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

// JWT_SECRET se lee desde process.env en cada llamada (no desde env.js cacheado)
// para permitir que los tests lo sobreescriban en beforeEach sin reiniciar el módulo.

/**
 * Middleware que verifica el token JWT del header Authorization.
 * Extrae el Bearer token, lo valida, busca el usuario en DB y lo adjunta a req.user.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message: 'Token de autenticación no proporcionado', code: 'UNAUTHORIZED' },
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message: 'Token de autenticación no proporcionado', code: 'UNAUTHORIZED' },
      });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      // TokenExpiredError y JsonWebTokenError son los dos casos que importan
      const message = jwtErr.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message, code: 'UNAUTHORIZED' },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { message: 'Usuario no encontrado', code: 'UNAUTHORIZED' },
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        data: null,
        meta: null,
        error: { message: 'Cuenta desactivada. Contacte al administrador', code: 'FORBIDDEN' },
      });
    }

    req.user = user;
    if (!res.locals) res.locals = {};
    res.locals.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

export { verifyToken };
