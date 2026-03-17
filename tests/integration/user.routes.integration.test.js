import { jest, describe, it, beforeAll, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let app;

beforeAll(async () => {
  // Mock auth + authorize para controlar respuestas 401/permitir paso
  jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
    verifyToken: jest.fn((req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
      }
      req.user = { id: 'user-1', organizationId: 'org-1', role: 'ADMIN' };
      return next();
    }),
    verifySession: jest.fn((_req, _res, next) => next()),
  }));

  jest.unstable_mockModule('../../src/middleware/authorize.js', () => ({
    default: () => (_req, _res, next) => next(),
  }));

  jest.unstable_mockModule('../../src/middleware/validate.js', () => ({
    default: () => (req, res, next) => {
      if (req.method === 'POST' && (!req.body.firstName || !req.body.email || !req.body.password)) {
        return res.status(422).json({ error: { code: 'VALIDATION_ERROR' } });
      }
      return next();
    },
  }));

  // Controladores stub sin dependencias de BD
  jest.unstable_mockModule('../../src/controllers/user.controller.js', () => ({
    listUsers: jest.fn((req, res) => res.json({ ok: true, user: req.user })),
    getUser: jest.fn((req, res) => res.json({ id: req.params.userId })),
    createUser: jest.fn((req, res) => res.status(201).json({ created: true, body: req.body })),
    updateUser: jest.fn((req, res) => res.json({ updated: true, body: req.body })),
    changePassword: jest.fn((req, res) => res.json({ changed: true })),
    deactivateUser: jest.fn((req, res) => res.json({ deactivated: true })),
    getUserStats: jest.fn((req, res) => res.json({ stats: true })),
  }));

  const { default: userRoutes } = await import('../../src/routes/user.routes.js');
  const { default: errorHandler } = await import('../../src/middleware/errorHandler.js');

  app = express();
  app.use(express.json());
  app.use('/api/v1/users', userRoutes);
  app.use(errorHandler);
});

describe('User routes integration (con Supertest)', () => {
  it('GET /api/v1/users devuelve 401 sin Authorization', async () => {
    const res = await request(app).get('/api/v1/users').set('Accept', 'application/json');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/users responde 200 con token', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/v1/users valida el body y retorna 422 en caso inválido', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token')
      .send({ firstName: '', lastName: '', email: 'no-email' });

    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/users responde 201 con payload válido', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token')
      .send({
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@example.com',
        role: 'ADMIN',
        password: 'secreto123',
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
  });

  it('PUT /api/v1/users/:id responde 200 con token', async () => {
    const res = await request(app)
      .put('/api/v1/users/11111111-1111-1111-1111-111111111111')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token')
      .send({
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@example.com',
        role: 'ADMIN',
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
  });

  it('PATCH /api/v1/users/:id/password responde 200 con token', async () => {
    const res = await request(app)
      .patch('/api/v1/users/11111111-1111-1111-1111-111111111111/password')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token')
      .send({ currentPassword: 'old', newPassword: 'new123', confirmPassword: 'new123' });

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
  });

  it('DELETE /api/v1/users/:id responde 200 con token', async () => {
    const res = await request(app)
      .delete('/api/v1/users/11111111-1111-1111-1111-111111111111')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.deactivated).toBe(true);
  });
});
