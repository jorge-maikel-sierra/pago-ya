import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockOrgCreate = jest.fn();
const mockFindUserByEmailForAuth = jest.fn();
const mockCreateUser = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    organization: { create: mockOrgCreate },
  },
}));

jest.unstable_mockModule('../../src/services/user.service.js', () => ({
  findUserByEmailForAuth: mockFindUserByEmailForAuth,
  createUser: mockCreateUser,
}));

const { registerOrganizationAndUser, loginAdminUser, generateAccessToken } =
  await import('../../src/services/auth.service.js');

const ORG_NAME = 'Test Org';
const USER_EMAIL = 'test@example.com';
const USER = {
  id: 'user-1',
  email: USER_EMAIL,
  organizationId: 'org-1',
  passwordHash: '$2a$10$saltsaltsalt',
  role: 'SUPER_ADMIN',
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('registerOrganizationAndUser', () => {
  it('crea organización y usuario cuando no existe email', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: 'org-1', name: ORG_NAME });
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

  it('lanza error cuando el email ya existe', async () => {
    mockFindUserByEmailForAuth.mockResolvedValue({ id: 'exists' });

    await expect(
      registerOrganizationAndUser({ firstName: 'A', email: USER_EMAIL, password: 'x' }),
    ).rejects.toThrow();
  });
});

describe('loginAdminUser', () => {
  it('lanza 401 cuando credenciales inválidas', async () => {
    // prisma mock: no user found
    const prisma = await import('../../src/config/prisma.js');
    prisma.default.user = { findUnique: jest.fn().mockResolvedValue(null) };

    await expect(loginAdminUser('no@user.com', 'pw')).rejects.toThrow('Credenciales inválidas');
  });
});
