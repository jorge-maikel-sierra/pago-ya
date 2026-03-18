import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks declarados ANTES del import dinámico (requisito ESM) ---
const mockOrgCreate = jest.fn();
const mockUserFindUnique = jest.fn();
const mockBcryptCompare = jest.fn();
const mockFindUserByEmailForAuth = jest.fn();
const mockCreateUser = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    organization: { create: mockOrgCreate },
    user: { findUnique: mockUserFindUnique },
  },
}));

jest.unstable_mockModule('../../src/services/user.service.js', () => ({
  findUserByEmailForAuth: mockFindUserByEmailForAuth,
  createUser: mockCreateUser,
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: { compare: mockBcryptCompare, hash: jest.fn().mockResolvedValue('$hash') },
}));

const { registerOrganizationAndUser, loginAdminUser, generateAccessToken } = await import(
  '../../src/services/auth.service.js'
);

const USER_EMAIL = 'test@example.com';

const buildUser = (overrides = {}) => ({
  id: 'user-1',
  email: USER_EMAIL,
  organizationId: 'org-1',
  passwordHash: '$2b$12$hash',
  role: 'SUPER_ADMIN',
  isActive: true,
  firstName: 'Test',
  lastName: 'User',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================
// registerOrganizationAndUser
// ===========================
describe('registerOrganizationAndUser', () => {
  it('crea organización y usuario cuando el email no existe', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: 'org-1', name: 'Test User' });
    mockCreateUser.mockResolvedValue({ id: 'user-1', email: USER_EMAIL });

    const result = await registerOrganizationAndUser({
      firstName: 'Test',
      lastName: 'User',
      email: USER_EMAIL,
      password: 'secret123',
    });

    expect(mockFindUserByEmailForAuth).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockCreateUser).toHaveBeenCalled();
    expect(result).toHaveProperty('organization');
    expect(result).toHaveProperty('user');
  });

  it('normaliza el email a minúsculas y sin espacios', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: 'org-1', name: 'T' });
    mockCreateUser.mockResolvedValue({ id: 'u-1', email: 'test@example.com' });

    await registerOrganizationAndUser({
      firstName: 'Test',
      email: ' Test@EXAMPLE.COM ',
      password: 'pw',
    });

    expect(mockFindUserByEmailForAuth).toHaveBeenCalledWith('test@example.com');
  });

  it('lanza error 400 cuando el email ya existe', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue({ id: 'existing' });

    await expect(
      registerOrganizationAndUser({ firstName: 'A', email: USER_EMAIL, password: 'x' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza error 400 con mensaje amigable en error P2002', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: 'org-1', name: 'Org' });
    const p2002 = new Error('Unique constraint');
    p2002.code = 'P2002';
    mockCreateUser.mockRejectedValue(p2002);

    await expect(
      registerOrganizationAndUser({ firstName: 'A', email: USER_EMAIL, password: 'x' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('propaga errores genéricos sin envolver', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockRejectedValue(new Error('DB error'));

    await expect(
      registerOrganizationAndUser({ firstName: 'A', email: USER_EMAIL, password: 'x' }),
    ).rejects.toThrow('DB error');
  });

  it('usa email como nombre de organización cuando faltan nombre y apellido', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: 'org-1', name: USER_EMAIL });
    mockCreateUser.mockResolvedValue({ id: 'u-1' });

    await registerOrganizationAndUser({ firstName: '', email: USER_EMAIL, password: 'pw' });

    expect(mockOrgCreate.mock.calls[0][0].data.name).toBe(USER_EMAIL);
  });
});

// ===========================
// loginAdminUser
// ===========================
describe('loginAdminUser', () => {
  it('retorna datos del usuario (sin passwordHash) cuando credenciales son válidas', async () => {
    const user = buildUser();
    mockUserFindUnique.mockResolvedValue(user);
    mockBcryptCompare.mockResolvedValue(true);

    const result = await loginAdminUser(USER_EMAIL, 'correct-pass');

    expect(result).not.toHaveProperty('passwordHash');
    expect(result.id).toBe('user-1');
    expect(result.role).toBe('SUPER_ADMIN');
  });

  it('lanza error 401 cuando el usuario no existe', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockBcryptCompare.mockResolvedValue(false);

    await expect(loginAdminUser('no@user.com', 'pw')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Credenciales inválidas',
    });
  });

  it('lanza error 401 cuando la contraseña es incorrecta', async () => {
    mockUserFindUnique.mockResolvedValue(buildUser());
    mockBcryptCompare.mockResolvedValue(false);

    await expect(loginAdminUser(USER_EMAIL, 'wrong')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('lanza error 403 cuando la cuenta está inactiva', async () => {
    mockUserFindUnique.mockResolvedValue(buildUser({ isActive: false }));
    mockBcryptCompare.mockResolvedValue(true);

    await expect(loginAdminUser(USER_EMAIL, 'pass')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Cuenta desactivada. Contacte al administrador',
    });
  });

  it('lanza error 403 cuando el rol es COLLECTOR', async () => {
    mockUserFindUnique.mockResolvedValue(buildUser({ role: 'COLLECTOR' }));
    mockBcryptCompare.mockResolvedValue(true);

    await expect(loginAdminUser(USER_EMAIL, 'pass')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Acceso denegado. Solo administradores',
    });
  });

  it('permite acceso al rol ADMIN', async () => {
    mockUserFindUnique.mockResolvedValue(buildUser({ role: 'ADMIN' }));
    mockBcryptCompare.mockResolvedValue(true);

    const result = await loginAdminUser(USER_EMAIL, 'pass');

    expect(result.role).toBe('ADMIN');
  });

  it('normaliza el email antes de buscar en la base de datos', async () => {
    mockUserFindUnique.mockResolvedValue(buildUser());
    mockBcryptCompare.mockResolvedValue(true);

    await loginAdminUser('  Test@EXAMPLE.COM  ', 'pass');

    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'test@example.com' } }),
    );
  });
});

// ===========================
// generateAccessToken
// ===========================
describe('generateAccessToken', () => {
  it('retorna un string JWT con tres partes', () => {
    const token = generateAccessToken('user-1');

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('incluye el userId en el payload como campo "sub"', () => {
    const token = generateAccessToken('user-abc');

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe('user-abc');
  });
});
