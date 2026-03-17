import { jest, describe, it, expect, beforeEach } from '@jest/globals';

let prismaMock = {};

const buildPrismaMock = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
});

let bcryptMock = {};

const buildBcryptMock = () => ({
  hash: jest.fn(),
  compare: jest.fn(),
});

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: prismaMock,
}));

jest.unstable_mockModule('bcryptjs', () => ({ default: bcryptMock, ...bcryptMock }));

let userService;

beforeEach(async () => {
  jest.resetModules();
  prismaMock = buildPrismaMock();
  bcryptMock = buildBcryptMock();
  userService = await import('../../src/services/user.service.js');
});

describe('user.service', () => {
  it('createUser hashea la contraseña y crea con email en minúsculas', async () => {
    prismaMock.user.create.mockResolvedValue({ id: '1', email: 'test@example.com' });
    bcryptMock.hash.mockResolvedValue('hashed');

    const result = await userService.createUser('org-1', {
      firstName: 'Ana',
      lastName: 'G',
      email: 'TEST@EXAMPLE.COM',
      password: 'secret',
      role: 'ADMIN',
    });

    expect(bcryptMock.hash).toHaveBeenCalledWith('secret', expect.any(Number));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'test@example.com' }) }),
    );
    expect(result.id).toBe('1');
  });

  it('findAllUsers pasa filtros y paginación a Prisma', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }]);

    const users = await userService.findAllUsers('org-1', { role: 'ADMIN', isActive: true, page: 2, limit: 10 });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', role: 'ADMIN', isActive: true }),
        skip: 10,
        take: 10,
      }),
    );
    expect(users[0].id).toBe('u1');
  });

  it('changePassword lanza error 400 si la contraseña actual no coincide', async () => {
    prismaMock.user.findFirstOrThrow.mockResolvedValue({ passwordHash: 'hashed' });
    bcryptMock.compare.mockResolvedValue(false);

    await expect(
      userService.changePassword('id', 'org', 'bad', 'newpass'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('countUsersByRole reduce el groupBy a objeto simple', async () => {
    prismaMock.user.groupBy.mockResolvedValue([
      { role: 'ADMIN', _count: { id: 2 } },
      { role: 'COLLECTOR', _count: { id: 3 } },
    ]);

    const result = await userService.countUsersByRole('org');

    expect(result).toEqual({ ADMIN: 2, COLLECTOR: 3 });
  });
});
