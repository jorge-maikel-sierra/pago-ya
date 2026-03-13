import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mock prisma BEFORE importing auth ---
const mockFindUnique = jest.fn();
jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    user: { findUnique: mockFindUnique },
  },
}));

const { verifyToken, verifySession } = await import('../../src/middleware/auth.js');
const jwt = await import('jsonwebtoken');

const JWT_SECRET = 'test-secret-key';

const buildReq = (overrides = {}) => ({
  headers: {},
  session: {},
  ...overrides,
});

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

const nextFn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
});

// ============================================
// verifyToken
// ============================================

describe('verifyToken', () => {
  describe('missing / malformed header', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = buildReq();
      const res = buildRes();

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token de autenticación no proporcionado' }),
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization does not start with Bearer', async () => {
      const req = buildReq({ headers: { authorization: 'Basic abc123' } });
      const res = buildRes();

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for empty Bearer value', async () => {
      const req = buildReq({ headers: { authorization: 'Bearer ' } });
      const res = buildRes();

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('invalid / expired token', () => {
    it('returns 401 for an invalid token', async () => {
      const req = buildReq({ headers: { authorization: 'Bearer invalid.token.here' } });
      const res = buildRes();

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token inválido' }));
    });

    it('returns 401 for an expired token', async () => {
      const token = jwt.default.sign({ sub: 'user-id' }, JWT_SECRET, { expiresIn: '-1s' });
      const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
      const res = buildRes();

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token expirado' }));
    });
  });

  describe('user lookup', () => {
    it('returns 401 when user is not found in database', async () => {
      const token = jwt.default.sign({ sub: 'non-existent-id' }, JWT_SECRET, { expiresIn: '1h' });
      const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
      const res = buildRes();

      mockFindUnique.mockResolvedValue(undefined);

      await verifyToken(req, res, nextFn);

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'non-existent-id' } }),
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Usuario no encontrado' }),
      );
    });

    it('returns 403 when user is inactive', async () => {
      const token = jwt.default.sign({ sub: 'inactive-user' }, JWT_SECRET, { expiresIn: '1h' });
      const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
      const res = buildRes();

      mockFindUnique.mockResolvedValue({
        id: 'inactive-user',
        role: 'COLLECTOR',
        isActive: false,
      });

      await verifyToken(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cuenta desactivada. Contacte al administrador' }),
      );
    });
  });

  describe('successful authentication', () => {
    it('attaches user to req and calls next()', async () => {
      const user = {
        id: 'valid-user-id',
        organizationId: 'org-1',
        role: 'ADMIN',
        firstName: 'Jorge',
        lastName: 'Sierra',
        email: 'jorge@test.com',
        isActive: true,
      };

      const token = jwt.default.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '1h' });
      const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
      const res = buildRes();

      mockFindUnique.mockResolvedValue(user);

      await verifyToken(req, res, nextFn);

      expect(req.user).toEqual(user);
      expect(nextFn).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('unexpected errors', () => {
    it('delegates unexpected errors to next(err)', async () => {
      const token = jwt.default.sign({ sub: 'user-id' }, JWT_SECRET, { expiresIn: '1h' });
      const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
      const res = buildRes();
      const dbError = new Error('DB connection lost');

      mockFindUnique.mockRejectedValue(dbError);

      await verifyToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith(dbError);
    });
  });
});

// ============================================
// verifySession
// ============================================

describe('verifySession', () => {
  it('redirects to /admin/login when session is missing', () => {
    const req = buildReq({ session: undefined });
    const res = buildRes();

    verifySession(req, res, nextFn);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('redirects to /admin/login when session.user is missing', () => {
    const req = buildReq({ session: {} });
    const res = buildRes();

    verifySession(req, res, nextFn);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('attaches session user to req.user and calls next()', () => {
    const sessionUser = { id: 'session-user', role: 'ADMIN', firstName: 'Admin' };
    const req = buildReq({ session: { user: sessionUser } });
    const res = buildRes();

    verifySession(req, res, nextFn);

    expect(req.user).toEqual(sessionUser);
    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
