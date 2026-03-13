import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { z, ZodError } from 'zod';
import validate from '../../src/middleware/validate.js';

const createReq = (overrides = {}) => ({
  body: {},
  query: {},
  params: {},
  ...overrides,
});

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validate middleware', () => {
  let nextFn;

  beforeEach(() => {
    nextFn = jest.fn();
  });

  describe('body validation', () => {
    const schema = z.object({
      body: z.object({
        name: z.string().min(1),
        age: z.number().positive(),
      }),
    });

    it('calls next() when body is valid', async () => {
      const req = createReq({ body: { name: 'Juan', age: 30 } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it('replaces req.body with parsed data', async () => {
      const req = createReq({ body: { name: 'Juan', age: 30, extra: true } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(req.body.name).toBe('Juan');
      expect(req.body.age).toBe(30);
    });

    it('passes ZodError to next() when body is invalid', async () => {
      const req = createReq({ body: { name: '', age: -5 } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
    });

    it('includes field paths in ZodError issues', async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      const err = nextFn.mock.calls[0][0];
      const fields = err.errors.map((e) => e.path.join('.'));
      expect(fields).toContain('body.name');
      expect(fields).toContain('body.age');
    });
  });

  describe('query validation', () => {
    const schema = z.object({
      query: z.object({
        page: z.coerce.number().int().positive(),
        limit: z.coerce.number().int().positive().max(100),
      }),
    });

    it('validates and replaces req.query', async () => {
      const req = createReq({ query: { page: '2', limit: '20' } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.query.page).toBe(2);
      expect(req.query.limit).toBe(20);
    });

    it('passes ZodError to next() for invalid query', async () => {
      const req = createReq({ query: { page: 'abc', limit: '-1' } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      const err = nextFn.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
    });
  });

  describe('params validation', () => {
    const schema = z.object({
      params: z.object({
        id: z.string().uuid(),
      }),
    });

    it('validates and replaces req.params', async () => {
      const req = createReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('passes ZodError to next() for invalid params', async () => {
      const req = createReq({ params: { id: 'not-a-uuid' } });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      const err = nextFn.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
    });
  });

  describe('combined validation (body + params + query)', () => {
    const schema = z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ amount: z.number().positive() }),
      query: z.object({ verbose: z.coerce.boolean().optional() }),
    });

    it('validates all three sources simultaneously', async () => {
      const req = createReq({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        body: { amount: 5000 },
        query: { verbose: 'true' },
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(req.body.amount).toBe(5000);
      expect(req.query.verbose).toBe(true);
    });

    it('reports errors from multiple sources', async () => {
      const req = createReq({
        params: { id: 'bad' },
        body: { amount: -1 },
        query: {},
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      const err = nextFn.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
      expect(err.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('partial schemas', () => {
    it('preserves req.body when schema has no body key', async () => {
      const schema = z.object({
        params: z.object({ id: z.string().uuid() }),
      });
      const originalBody = { name: 'test' };
      const req = createReq({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        body: originalBody,
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.body).toBe(originalBody);
    });

    it('preserves req.query when schema has no query key', async () => {
      const schema = z.object({
        body: z.object({ name: z.string() }),
      });
      const originalQuery = { page: '1' };
      const req = createReq({
        body: { name: 'test' },
        query: originalQuery,
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.query).toBe(originalQuery);
    });

    it('preserves req.params when schema has no params key', async () => {
      const schema = z.object({
        body: z.object({ name: z.string() }),
      });
      const originalParams = { id: '123' };
      const req = createReq({
        body: { name: 'test' },
        params: originalParams,
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(req.params).toBe(originalParams);
    });
  });

  describe('async schema support', () => {
    it('works with schemas that use .refine() (async)', async () => {
      const schema = z.object({
        body: z
          .object({
            password: z.string().min(8),
            confirmPassword: z.string().min(8),
          })
          .refine((data) => data.password === data.confirmPassword, {
            message: 'Las contraseñas no coinciden',
            path: ['confirmPassword'],
          }),
      });

      const req = createReq({
        body: { password: 'secret123', confirmPassword: 'different' },
      });
      const res = createRes();

      await validate(schema)(req, res, nextFn);

      const err = nextFn.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
      expect(err.errors[0].message).toBe('Las contraseñas no coinciden');
    });
  });
});
