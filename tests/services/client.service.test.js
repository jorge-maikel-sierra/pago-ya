import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockFindManyLoans = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    client: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      findFirstOrThrow: jest.fn().mockResolvedValue(true),
      create: mockCreate,
      update: mockUpdate,
    },
    loan: { findMany: mockFindManyLoans },
    incident: { findMany: jest.fn().mockResolvedValue([]) },
    route: { findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]) },
  },
}));

const {
  findClients,
  searchClients,
  findClientById,
  createClient,
  updateClient,
  toggleClientStatus,
} = await import('../../src/services/client.service.js');

beforeEach(() => jest.clearAllMocks());

describe('client.service', () => {
  it('findClients devuelve resultados', async () => {
    mockFindMany.mockResolvedValue([{ id: 'c1' }]);
    const res = await findClients('org1', { search: 'x' });
    expect(res).toEqual([{ id: 'c1' }]);
  });

  it('searchClients retorna vacio si q vacío', async () => {
    const res = await searchClients('org1', '');
    expect(res).toEqual([]);
  });

  it('findClientById lanza 404 cuando no existe', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(findClientById('no', 'org1')).rejects.toThrow('Cliente no encontrado');
  });

  it('createClient maneja P2002', async () => {
    mockCreate.mockRejectedValue({ code: 'P2002' });
    await expect(createClient('org1', { firstName: 'a', documentNumber: '1' })).rejects.toThrow();
  });

  it('toggleClientStatus lanza 404 cuando no encuentra cliente', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(toggleClientStatus('no', 'org1')).rejects.toThrow('Cliente no encontrado');
  });

  it('updateClient actualiza datos del cliente correctamente', async () => {
    mockUpdate.mockResolvedValue({ id: 'c1', firstName: 'Juan' });
    const result = await updateClient('c1', 'org1', { firstName: 'Juan', lastName: 'García' });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.firstName).toBe('Juan');
  });

  it('updateClient lanza error 409 en P2002 (documento duplicado)', async () => {
    const err = new Error('Unique constraint');
    err.code = 'P2002';
    mockUpdate.mockRejectedValue(err);
    await expect(
      updateClient('c1', 'org1', { firstName: 'A', documentNumber: '999' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
