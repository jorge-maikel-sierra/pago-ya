import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import errorHandler from '../../src/middleware/errorHandler.js';

const buildReq = (acceptsResult = 'json') => ({
  accepts: jest.fn().mockReturnValue(acceptsResult),
});

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.render = jest.fn().mockReturnValue(res);
  return res;
};

const nextFn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'test';
});

// ============================================
// ZodError → 422
// ============================================

describe('ZodError handling', () => {
  it('returns 422 JSON with field details for API requests', () => {
    const zodErr = new ZodError([
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        message: 'Requerido',
        path: ['email'],
      },
      {
        code: 'invalid_type',
        expected: 'number',
        received: 'string',
        message: 'Debe ser número',
        path: ['amount'],
      },
    ]);

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(zodErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Error de validación',
        errors: [
          { field: 'email', message: 'Requerido' },
          { field: 'amount', message: 'Debe ser número' },
        ],
      }),
    );
  });

  it('renders EJS error view for HTML requests', () => {
    const zodErr = new ZodError([
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        message: 'Requerido',
        path: ['name'],
      },
    ]);

    const req = buildReq('html');
    const res = buildRes();

    errorHandler(zodErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.render).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        statusCode: 422,
        message: 'Error de validación',
      }),
    );
  });
});

// ============================================
// Prisma Errors
// ============================================

describe('Prisma error handling', () => {
  it('maps P2002 (unique constraint) to 409 Conflict', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', meta: { target: ['email'] }, clientVersion: '5.14.0' },
    );

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('email'),
      }),
    );
  });

  it('maps P2025 (record not found) to 404', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.14.0',
    });

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Registro no encontrado',
      }),
    );
  });

  it('maps P2003 (foreign key violation) to 400', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '5.14.0',
    });

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps P2014 (relation violation) to 400', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Relation violation', {
      code: 'P2014',
      clientVersion: '5.14.0',
    });

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('falls through to 500 for unmapped Prisma error codes', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Some other Prisma error', {
      code: 'P2999',
      clientVersion: '5.14.0',
    });

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles PrismaClientValidationError as 400', () => {
    const prismaErr = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation',
      { clientVersion: '5.14.0' },
    );

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('includes target fields in P2002 message', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      meta: { target: ['email', 'organizationId'] },
      clientVersion: '5.14.0',
    });

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('email, organizationId'),
      }),
    );
  });
});

// ============================================
// Operational Errors
// ============================================

describe('operational error handling', () => {
  it('uses statusCode and message from operational errors', () => {
    const err = new Error('Préstamo no encontrado');
    err.isOperational = true;
    err.statusCode = 404;

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Préstamo no encontrado' }),
    );
  });

  it('defaults to 500 when operational error has no statusCode', () => {
    const err = new Error('Something failed');
    err.isOperational = true;

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================
// Generic / Unexpected Errors → 500
// ============================================

describe('generic error handling', () => {
  it('returns 500 for unexpected errors', () => {
    const err = new Error('Unexpected crash');

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Error interno del servidor',
      }),
    );
  });

  it('does not include stack in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Crash');

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.stack).toBeUndefined();
  });

  it('includes stack in development', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev crash');

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.stack).toBeDefined();
  });
});

// ============================================
// Content Negotiation (HTML vs JSON)
// ============================================

describe('content negotiation', () => {
  it('renders EJS view when client accepts HTML', () => {
    const err = new Error('Not found');
    err.isOperational = true;
    err.statusCode = 404;

    const req = buildReq('html');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    expect(res.render).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        title: 'Error 404',
        statusCode: 404,
        message: 'Not found',
      }),
    );
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns JSON when client accepts JSON', () => {
    const err = new Error('Bad request');
    err.isOperational = true;
    err.statusCode = 400;

    const req = buildReq('json');
    const res = buildRes();

    errorHandler(err, req, res, nextFn);

    expect(res.json).toHaveBeenCalled();
    expect(res.render).not.toHaveBeenCalled();
  });

  it('renders HTML for Prisma errors when client accepts HTML', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.14.0',
    });

    const req = buildReq('html');
    const res = buildRes();

    errorHandler(prismaErr, req, res, nextFn);

    expect(res.render).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        statusCode: 404,
      }),
    );
  });
});
