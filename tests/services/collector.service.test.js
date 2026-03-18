import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks definidos ANTES del import dinámico ---
const mockUserFindMany = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserFindFirstOrThrow = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserDelete = jest.fn();
const mockLoanCount = jest.fn();
const mockPaymentCount = jest.fn();
const mockIncidentCount = jest.fn();
const mockRouteUpdateMany = jest.fn();
const mockGpsDeleteMany = jest.fn();
const mockTransaction = jest.fn();
const mockBcryptHash = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    user: {
      findMany: mockUserFindMany,
      findFirst: mockUserFindFirst,
      findFirstOrThrow: mockUserFindFirstOrThrow,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
    },
    loan: { count: mockLoanCount },
    payment: { count: mockPaymentCount },
    incident: { count: mockIncidentCount },
    route: { updateMany: mockRouteUpdateMany },
    gpsLocation: { deleteMany: mockGpsDeleteMany },
    $transaction: mockTransaction,
  },
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: mockBcryptHash,
    compare: jest.fn(),
  },
}));

const {
  findCollectors,
  searchCollectors,
  findCollectorById,
  createCollector,
  updateCollector,
  deleteCollector,
} = await import('../../src/services/collector.service.js');

const ORG_ID = 'org-111';
const COLLECTOR_ID = 'col-222';

const sampleCollector = {
  id: COLLECTOR_ID,
  firstName: 'Juan',
  lastName: 'Pérez',
  email: 'juan@test.com',
  phone: '3001234567',
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBcryptHash.mockResolvedValue('$2b$12$hashed');
});

// ===========================
// findCollectors
// ===========================
describe('findCollectors', () => {
  it('retorna la lista de cobradores de la organización', async () => {
    mockUserFindMany.mockResolvedValue([sampleCollector]);

    const result = await findCollectors(ORG_ID);

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_ID, role: 'COLLECTOR' } }),
    );
    expect(result).toEqual([sampleCollector]);
  });

  it('retorna arreglo vacío si no hay cobradores', async () => {
    mockUserFindMany.mockResolvedValue([]);

    const result = await findCollectors(ORG_ID);

    expect(result).toEqual([]);
  });
});

// ===========================
// searchCollectors
// ===========================
describe('searchCollectors', () => {
  it('retorna arreglo vacío cuando q es cadena vacía', async () => {
    const result = await searchCollectors(ORG_ID, '');

    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('retorna arreglo vacío cuando q es solo espacios', async () => {
    const result = await searchCollectors(ORG_ID, '   ');

    expect(result).toEqual([]);
  });

  it('busca cobradores con el término dado', async () => {
    mockUserFindMany.mockResolvedValue([sampleCollector]);

    const result = await searchCollectors(ORG_ID, 'Juan');

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID, role: 'COLLECTOR' }),
      }),
    );
    expect(result).toEqual([sampleCollector]);
  });

  it('usa el límite por defecto de 15', async () => {
    mockUserFindMany.mockResolvedValue([]);

    await searchCollectors(ORG_ID, 'test');

    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 15 }));
  });
});

// ===========================
// findCollectorById
// ===========================
describe('findCollectorById', () => {
  it('retorna el cobrador cuando existe', async () => {
    mockUserFindFirst.mockResolvedValue(sampleCollector);

    const result = await findCollectorById(COLLECTOR_ID, ORG_ID);

    expect(result).toEqual(sampleCollector);
  });

  it('lanza error 404 si el cobrador no existe', async () => {
    mockUserFindFirst.mockResolvedValue(null);

    await expect(findCollectorById('no-existe', ORG_ID)).rejects.toMatchObject({
      message: 'Cobrador no encontrado',
      statusCode: 404,
    });
  });
});

// ===========================
// createCollector
// ===========================
describe('createCollector', () => {
  const newCollectorData = {
    firstName: 'Ana',
    lastName: 'Gómez',
    email: 'ana@test.com',
    phone: '3009876543',
    password: 'pass123',
  };

  it('crea un cobrador y retorna el usuario creado', async () => {
    mockUserCreate.mockResolvedValue({ id: 'new-col', ...newCollectorData });

    const result = await createCollector(ORG_ID, newCollectorData);

    expect(mockBcryptHash).toHaveBeenCalledWith('pass123', 12);
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'COLLECTOR', organizationId: ORG_ID }),
      }),
    );
    expect(result.id).toBe('new-col');
  });

  it('fuerza role=COLLECTOR sin importar los datos de entrada', async () => {
    mockUserCreate.mockResolvedValue({ id: 'c', role: 'COLLECTOR' });

    await createCollector(ORG_ID, newCollectorData);

    const createCall = mockUserCreate.mock.calls[0][0];
    expect(createCall.data.role).toBe('COLLECTOR');
  });

  it('usa null para phone cuando no se proporciona', async () => {
    const data = { ...newCollectorData };
    delete data.phone;
    mockUserCreate.mockResolvedValue({ id: 'c2' });

    await createCollector(ORG_ID, data);

    expect(mockUserCreate.mock.calls[0][0].data.phone).toBeNull();
  });

  it('lanza error 409 con isOperational cuando el email ya existe (P2002)', async () => {
    const p2002 = new Error('Unique constraint');
    p2002.code = 'P2002';
    mockUserCreate.mockRejectedValue(p2002);

    await expect(createCollector(ORG_ID, newCollectorData)).rejects.toMatchObject({
      statusCode: 409,
      isOperational: true,
    });
  });

  it('propaga errores genéricos sin envolverlos', async () => {
    const dbError = new Error('DB down');
    mockUserCreate.mockRejectedValue(dbError);

    await expect(createCollector(ORG_ID, newCollectorData)).rejects.toThrow('DB down');
  });
});

// ===========================
// updateCollector
// ===========================
describe('updateCollector', () => {
  const updateData = {
    firstName: 'Juan',
    lastName: 'Actualizado',
    email: 'nuevo@test.com',
    phone: '3001111111',
    isActive: true,
  };

  it('actualiza el cobrador correctamente', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    mockUserUpdate.mockResolvedValue({ id: COLLECTOR_ID, ...updateData });

    const result = await updateCollector(COLLECTOR_ID, ORG_ID, updateData);

    expect(result.firstName).toBe('Juan');
  });

  it('hashea la contraseña si se provee una nueva', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    mockUserUpdate.mockResolvedValue({ id: COLLECTOR_ID });

    await updateCollector(COLLECTOR_ID, ORG_ID, { ...updateData, password: 'nuevo-pass' });

    expect(mockBcryptHash).toHaveBeenCalledWith('nuevo-pass', 12);
  });

  it('no hashea contraseña cuando no se provee', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    mockUserUpdate.mockResolvedValue({ id: COLLECTOR_ID });

    await updateCollector(COLLECTOR_ID, ORG_ID, updateData);

    expect(mockBcryptHash).not.toHaveBeenCalled();
  });

  it('no hashea contraseña cuando es cadena vacía', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    mockUserUpdate.mockResolvedValue({ id: COLLECTOR_ID });

    await updateCollector(COLLECTOR_ID, ORG_ID, { ...updateData, password: '   ' });

    expect(mockBcryptHash).not.toHaveBeenCalled();
  });

  it('lanza error 409 con isOperational en P2002 al actualizar', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    const p2002 = new Error('Unique constraint');
    p2002.code = 'P2002';
    mockUserUpdate.mockRejectedValue(p2002);

    await expect(updateCollector(COLLECTOR_ID, ORG_ID, updateData)).rejects.toMatchObject({
      statusCode: 409,
      isOperational: true,
    });
  });

  it('propaga errores genéricos desde update', async () => {
    mockUserFindFirstOrThrow.mockResolvedValue(sampleCollector);
    mockUserUpdate.mockRejectedValue(new Error('DB error'));

    await expect(updateCollector(COLLECTOR_ID, ORG_ID, updateData)).rejects.toThrow('DB error');
  });
});

// ===========================
// deleteCollector
// ===========================
describe('deleteCollector', () => {
  const setupDelete = ({
    collector = { id: COLLECTOR_ID },
    loans = 0,
    payments = 0,
    incidents = 0,
  } = {}) => {
    mockUserFindFirst.mockResolvedValue(collector);
    // $transaction recibe array de promesas y las resuelve
    mockTransaction.mockImplementation((promises) => Promise.all(promises));
    mockLoanCount.mockResolvedValue(loans);
    mockPaymentCount.mockResolvedValue(payments);
    mockIncidentCount.mockResolvedValue(incidents);
    mockRouteUpdateMany.mockResolvedValue({ count: 0 });
    mockGpsDeleteMany.mockResolvedValue({ count: 0 });
    mockUserDelete.mockResolvedValue({ id: COLLECTOR_ID });
  };

  it('elimina el cobrador cuando no tiene registros asociados', async () => {
    setupDelete();

    await deleteCollector(COLLECTOR_ID, ORG_ID);

    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: COLLECTOR_ID } });
  });

  it('libera las rutas asignadas antes de borrar el usuario', async () => {
    setupDelete();

    await deleteCollector(COLLECTOR_ID, ORG_ID);

    expect(mockRouteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ collectorId: COLLECTOR_ID }) }),
    );
  });

  it('elimina las ubicaciones GPS del cobrador', async () => {
    setupDelete();

    await deleteCollector(COLLECTOR_ID, ORG_ID);

    expect(mockGpsDeleteMany).toHaveBeenCalledWith({ where: { collectorId: COLLECTOR_ID } });
  });

  it('lanza error 404 si el cobrador no existe', async () => {
    mockUserFindFirst.mockResolvedValue(null);

    await expect(deleteCollector('no-existe', ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
      isOperational: true,
    });
  });

  it('lanza error 409 si el cobrador tiene préstamos', async () => {
    setupDelete({ loans: 2 });

    await expect(deleteCollector(COLLECTOR_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 409,
      isOperational: true,
    });
  });

  it('lanza error 409 si el cobrador tiene pagos', async () => {
    setupDelete({ payments: 1 });

    await expect(deleteCollector(COLLECTOR_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 409,
      isOperational: true,
    });
  });

  it('lanza error 409 si el cobrador tiene incidentes', async () => {
    setupDelete({ incidents: 3 });

    await expect(deleteCollector(COLLECTOR_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 409,
      isOperational: true,
    });
  });
});
