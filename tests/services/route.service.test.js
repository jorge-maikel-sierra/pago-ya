import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    route: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      findFirstOrThrow: jest.fn().mockResolvedValue(true),
      update: mockUpdate,
    },
  },
}));

const { findRoutes, searchRoutes, createRoute, findRouteById, updateRoute } = await import(
  '../../src/services/route.service.js'
);

beforeEach(() => jest.clearAllMocks());

describe('route.service', () => {
  it('findRoutes lista rutas', async () => {
    mockFindMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await findRoutes('org1');
    expect(res).toEqual([{ id: 'r1' }]);
  });

  it('searchRoutes retorna vacio si q vacío', async () => {
    const res = await searchRoutes('org1', '');
    expect(res).toEqual([]);
  });

  it('createRoute crea ruta', async () => {
    mockCreate.mockResolvedValue({ id: 'r2' });
    const res = await createRoute('org1', { name: 'Nombre' });
    expect(res).toHaveProperty('id');
  });

  it('findRouteById lanza 404 cuando no existe', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(findRouteById('no', 'org1')).rejects.toThrow('Ruta no encontrada');
  });

  it('updateRoute actualiza la ruta correctamente', async () => {
    mockUpdate.mockResolvedValue({ id: 'r1', name: 'Nueva Ruta' });
    const result = await updateRoute('r1', 'org1', { name: 'Nueva Ruta' });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Nueva Ruta');
  });

  it('updateRoute propaga errores de base de datos', async () => {
    const err = new Error('Unique constraint');
    err.code = 'P2002';
    mockUpdate.mockRejectedValue(err);
    await expect(updateRoute('r1', 'org1', { name: 'Dup' })).rejects.toThrow('Unique constraint');
  });
});
