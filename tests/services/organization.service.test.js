import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks declarados antes del import dinámico (requisito ESM) ---
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockFindUniqueOrThrow = jest.fn();
const mockUpdate = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserFindFirstOrThrow = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockBcryptHash = jest.fn().mockResolvedValue('$hashed');

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    organization: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      findUniqueOrThrow: mockFindUniqueOrThrow,
      update: mockUpdate,
    },
    user: {
      findMany: mockUserFindMany,
      findFirst: mockUserFindFirst,
      findFirstOrThrow: mockUserFindFirstOrThrow,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  },
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: { hash: mockBcryptHash, compare: jest.fn() },
}));

const {
  findOrganizations,
  createOrganization,
  findOrganizationById,
  updateOrganization,
  findOrgUsers,
  findOrgUserById,
  createOrgUser,
  updateOrgUser,
} = await import('../../src/services/organization.service.js');

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

beforeEach(() => jest.clearAllMocks());

// =====================
// findOrganizations
// =====================
describe('findOrganizations', () => {
  it('retorna lista con búsqueda', async () => {
    mockFindMany.mockResolvedValue([{ id: ORG_ID, name: 'Org 1' }]);
    const res = await findOrganizations({ search: 'Org' });
    expect(res).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });

  it('retorna lista sin filtro cuando no se pasa búsqueda', async () => {
    mockFindMany.mockResolvedValue([]);
    await findOrganizations();
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

// =====================
// createOrganization
// =====================
describe('createOrganization', () => {
  it('crea organización correctamente', async () => {
    mockCreate.mockResolvedValue({ id: ORG_ID, name: 'Nueva Org' });
    const result = await createOrganization({ name: 'Nueva Org' });
    expect(result.id).toBe(ORG_ID);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('lanza error 409 en constraint P2002 de nit', async () => {
    const err = new Error('Unique');
    err.code = 'P2002';
    err.meta = { target: ['nit'] };
    mockCreate.mockRejectedValue(err);
    await expect(createOrganization({ name: 'X', nit: '123' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('propaga errores genéricos sin statusCode', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));
    await expect(createOrganization({ name: 'X' })).rejects.toThrow('DB error');
  });
});

// =====================
// findOrganizationById
// =====================
describe('findOrganizationById', () => {
  it('retorna organización cuando existe', async () => {
    mockFindUnique.mockResolvedValue({ id: ORG_ID, name: 'Org' });
    const result = await findOrganizationById(ORG_ID);
    expect(result.id).toBe(ORG_ID);
  });

  it('lanza error 404 cuando no existe', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(findOrganizationById('nope')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Organización no encontrada',
    });
  });
});

// =====================
// updateOrganization
// =====================
describe('updateOrganization', () => {
  it('actualiza correctamente', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: ORG_ID });
    mockUpdate.mockResolvedValue({ id: ORG_ID, name: 'Updated' });
    const result = await updateOrganization(ORG_ID, { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('lanza error 409 en constraint P2002 al actualizar', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: ORG_ID });
    const err = new Error('Unique');
    err.code = 'P2002';
    err.meta = { target: ['email'] };
    mockUpdate.mockRejectedValue(err);
    await expect(updateOrganization(ORG_ID, { name: 'x' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('propaga error cuando findUniqueOrThrow falla (org no existe)', async () => {
    mockFindUniqueOrThrow.mockRejectedValue(new Error('Not found'));
    await expect(updateOrganization('nope', { name: 'x' })).rejects.toThrow('Not found');
  });
});

// =====================
// findOrgUsers
// =====================
describe('findOrgUsers', () => {
  it('retorna usuarios de la organización sin búsqueda', async () => {
    mockUserFindMany.mockResolvedValue([{ id: USER_ID }]);
    const result = await findOrgUsers(ORG_ID);
    expect(result).toHaveLength(1);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_ID } }),
    );
  });

  it('aplica filtro de búsqueda cuando se pasa search', async () => {
    mockUserFindMany.mockResolvedValue([]);
    await findOrgUsers(ORG_ID, { search: 'juan' });
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });
});

// =====================
// findOrgUserById
// =====================
describe('findOrgUserById', () => {
  it('retorna usuario cuando existe', async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID, firstName: 'Juan' });
    const result = await findOrgUserById(USER_ID, ORG_ID);
    expect(result.id).toBe(USER_ID);
  });

  it('lanza error 404 cuando no existe', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await expect(findOrgUserById('nope', ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Usuario no encontrado',
    });
  });
});

// =====================
// createOrgUser
// =====================
describe('createOrgUser', () => {
  it('crea usuario con contraseña hasheada', async () => {
    mockUserCreate.mockResolvedValue({ id: USER_ID, email: 'new@test.com' });
    const result = await createOrgUser(ORG_ID, {
      firstName: 'Juan',
      lastName: 'García',
      email: 'new@test.com',
      role: 'COLLECTOR',
      password: 'secret123',
    });
    expect(mockBcryptHash).toHaveBeenCalledWith('secret123', 12);
    expect(result.id).toBe(USER_ID);
  });

  it('lanza error 409 en P2002 (email duplicado)', async () => {
    const err = new Error('Unique');
    err.code = 'P2002';
    mockUserCreate.mockRejectedValue(err);
    await expect(
      createOrgUser(ORG_ID, {
        firstName: 'A',
        email: 'dup@test.com',
        role: 'ADMIN',
        password: 'pw',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('propaga errores genéricos', async () => {
    mockUserCreate.mockRejectedValue(new Error('DB error'));
    await expect(
      createOrgUser(ORG_ID, { firstName: 'A', email: 'x@x.com', role: 'ADMIN', password: 'pw' }),
    ).rejects.toThrow('DB error');
  });
});

// =====================
// updateOrgUser
// =====================
describe('updateOrgUser', () => {
  it('actualiza usuario sin cambiar contraseña', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue({ id: USER_ID });
    mockUserUpdate.mockResolvedValue({ id: USER_ID, firstName: 'Pedro' });
    const result = await updateOrgUser(USER_ID, ORG_ID, {
      firstName: 'Pedro',
      role: 'ADMIN',
    });
    expect(mockBcryptHash).not.toHaveBeenCalled();
    expect(result.firstName).toBe('Pedro');
  });

  it('hashea contraseña cuando se provee password no vacío', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue({ id: USER_ID });
    mockUserUpdate.mockResolvedValue({ id: USER_ID });
    await updateOrgUser(USER_ID, ORG_ID, {
      firstName: 'Pedro',
      role: 'ADMIN',
      password: 'newpass',
    });
    expect(mockBcryptHash).toHaveBeenCalledWith('newpass', 12);
  });

  it('lanza error 409 en P2002 al actualizar email duplicado', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue({ id: USER_ID });
    const err = new Error('Unique');
    err.code = 'P2002';
    mockUserUpdate.mockRejectedValue(err);
    await expect(
      updateOrgUser(USER_ID, ORG_ID, { firstName: 'A', role: 'ADMIN', email: 'dup@x.com' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('propaga error cuando findFirstOrThrow falla (usuario no en org)', async () => {
    mockUserFindFirstOrThrow.mockRejectedValue(new Error('Not found'));
    await expect(updateOrgUser('nope', ORG_ID, { firstName: 'A', role: 'ADMIN' })).rejects.toThrow(
      'Not found',
    );
  });
});
