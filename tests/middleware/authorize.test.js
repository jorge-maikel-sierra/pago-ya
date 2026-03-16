import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import authorize from '../../src/middleware/authorize.js';

const buildReq = (user) => ({ user });

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const nextFn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authorize', () => {
  describe('no authenticated user', () => {
    it('returns 401 when req.user is undefined', () => {
      const middleware = authorize('ADMIN');
      const req = buildReq(undefined);
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'No autenticado' }) }),
      );
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe('role not allowed', () => {
    it('returns 403 when user role is not in allowed roles', () => {
      const middleware = authorize('SUPER_ADMIN', 'ADMIN');
      const req = buildReq({ role: 'COLLECTOR' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'No tiene permisos para acceder a este recurso',
          }),
        }),
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('returns 403 for ADMIN trying to access SUPER_ADMIN route', () => {
      const middleware = authorize('SUPER_ADMIN');
      const req = buildReq({ role: 'ADMIN' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('role allowed', () => {
    it('calls next() when user role matches single allowed role', () => {
      const middleware = authorize('ADMIN');
      const req = buildReq({ role: 'ADMIN' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when user role matches one of multiple allowed roles', () => {
      const middleware = authorize('SUPER_ADMIN', 'ADMIN', 'COLLECTOR');
      const req = buildReq({ role: 'COLLECTOR' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('calls next() for SUPER_ADMIN on any route that includes it', () => {
      const middleware = authorize('SUPER_ADMIN', 'ADMIN');
      const req = buildReq({ role: 'SUPER_ADMIN' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('returns 403 when called with no roles (empty arguments)', () => {
      const middleware = authorize();
      const req = buildReq({ role: 'ADMIN' });
      const res = buildRes();

      middleware(req, res, nextFn);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
