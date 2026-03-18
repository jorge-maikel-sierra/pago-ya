import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockFindUniqueOrThrow = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    organization: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      findUniqueOrThrow: mockFindUniqueOrThrow,
      update: mockUpdate,
    },
  },
}));

const {
  findOrganizations,
  createOrganization,
  findOrganizationById,
  updateOrganization,
} = await import('../../src/services/organization.service.js');

beforeEach(() => jest.clearAllMocks());

describe('organization.service', () => {
  it('findOrganizations devuelve lista', async () => {
    mockFindMany.mockResolvedValue([{ id: 'org1', name: 'Org 1' }]);
    const res = await findOrganizations({ search: 'Org' });
    expect(res).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalled();
  });

  it('createOrganization maneja constraint P2002', async () => {
    mockCreate.mockRejectedValue({ code: 'P2002', meta: { target: ['nit'] } });
    await expect(createOrganization({ name: 'X', nit: '123' })).rejects.toThrow();
  });

  it('findOrganizationById lanza 404 cuando no existe', async () => {
    mockFindUniqueOrThrow.mockImplementation(() => {
      const err = new Error('Not found');
      throw err;
    });
    await expect(findOrganizationById('nope')).rejects.toThrow('Organización no encontrada');
  });

  it('updateOrganization maneja P2002', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'org1' });
    mockUpdate.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
    await expect(updateOrganization('org1', { name: 'x' })).rejects.toThrow();
  });
});
