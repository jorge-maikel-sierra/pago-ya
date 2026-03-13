import { describe, it, expect } from '@jest/globals';
import { ZodError } from 'zod';
import { loginSchema } from '../../src/schemas/auth.schema.js';

describe('loginSchema', () => {
  const validPayload = {
    email: 'admin@pagadiario.co',
    password: 'secret123',
  };

  it('accepts a valid email and password', () => {
    const result = loginSchema.parse(validPayload);

    expect(result.email).toBe('admin@pagadiario.co');
    expect(result.password).toBe('secret123');
  });

  it('trims and lowercases the email', () => {
    const result = loginSchema.parse({
      email: '  Admin@PagaDiario.CO  ',
      password: 'secret123',
    });

    expect(result.email).toBe('admin@pagadiario.co');
  });

  it('rejects missing email', () => {
    expect(() => loginSchema.parse({ password: 'secret123' })).toThrow(ZodError);
  });

  it('rejects invalid email format', () => {
    expect(() => loginSchema.parse({ email: 'not-an-email', password: 'secret123' })).toThrow(
      ZodError,
    );
  });

  it('rejects empty email string', () => {
    expect(() => loginSchema.parse({ email: '', password: 'secret123' })).toThrow(ZodError);
  });

  it('rejects missing password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.co' })).toThrow(ZodError);
  });

  it('rejects password shorter than 6 characters', () => {
    expect(() => loginSchema.parse({ email: 'a@b.co', password: '12345' })).toThrow(ZodError);
  });

  it('accepts password with exactly 6 characters', () => {
    const result = loginSchema.parse({ email: 'a@b.co', password: '123456' });

    expect(result.password).toBe('123456');
  });

  it('rejects empty body', () => {
    expect(() => loginSchema.parse({})).toThrow(ZodError);
  });

  it('returns descriptive error messages', () => {
    try {
      loginSchema.parse({ email: 'bad', password: '12' });
    } catch (err) {
      const messages = err.errors.map((e) => e.message);
      expect(messages).toContain('Debe ser un email válido');
      expect(messages).toContain('La contraseña debe tener al menos 6 caracteres');
    }
  });
});
