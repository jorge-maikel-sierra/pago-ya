import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockFindUniqueOrg = jest.fn();
const mockFindManySchedules = jest.fn();
const mockGenerateExcel = jest.fn();
const mockEnqueuePdfGeneration = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    organization: { findUnique: mockFindUniqueOrg },
    paymentSchedule: { findMany: mockFindManySchedules },
  },
}));

jest.unstable_mockModule('../../src/utils/asyncHandler.js', () => ({
  default: (fn) => fn,
}));

jest.unstable_mockModule('../../src/services/excel.service.js', () => ({
  generateDailyPortfolioExcel: mockGenerateExcel,
}));

jest.unstable_mockModule('../../src/services/notification.service.js', () => ({
  enqueuePdfGeneration: mockEnqueuePdfGeneration,
}));

const { exportReport } = await import('../../src/controllers/report.controller.js');

// --- Fixtures ---
const ORG_ID = 'org-550e8400-e29b-41d4-a716-446655440000';
const USER_ID = 'user-001';

const sampleSchedules = [
  {
    installmentNumber: 1,
    amountDue: { toString: () => '50000.00' },
    loan: {
      id: 'loan-001',
      status: 'ACTIVE',
      outstandingBalance: { toString: () => '450000.00' },
      moraAmount: { toString: () => '0.00' },
      client: {
        firstName: 'Juan',
        lastName: 'Pérez',
        documentNumber: '1234567890',
        phone: '3001234567',
        address: 'Calle 1 #2-3',
      },
      collector: { firstName: 'Carlos', lastName: 'López' },
    },
  },
];

// --- Helpers ---
const createReq = (overrides = {}) => ({
  user: {
    id: USER_ID,
    organizationId: ORG_ID,
    role: 'ADMIN',
    ...overrides.user,
  },
  params: { format: 'xlsx', ...overrides.params },
  session: { ...overrides.session },
});

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// exportReport — formato xlsx
// ============================================
describe('exportReport (xlsx)', () => {
  beforeEach(() => {
    mockFindUniqueOrg.mockResolvedValue({ name: 'Mi Empresa' });
    mockFindManySchedules.mockResolvedValue(sampleSchedules);
    mockGenerateExcel.mockResolvedValue(Buffer.from('xlsx-fake'));
  });

  it('consulta la organización por el organizationId del usuario', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(mockFindUniqueOrg).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      select: { name: true },
    });
  });

  it('consulta los schedules del día actual para la organización', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(mockFindManySchedules).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loan: { organizationId: ORG_ID },
        }),
      }),
    );
  });

  it('llama a generateDailyPortfolioExcel con filas mapeadas', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(mockGenerateExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: 'Mi Empresa',
        rows: expect.arrayContaining([
          expect.objectContaining({
            clientName: 'Juan Pérez',
            documentNumber: '1234567890',
            loanId: 'loan-001',
          }),
        ]),
      }),
    );
  });

  it('usa "Paga Diario" como nombre si la organización no existe', async () => {
    mockFindUniqueOrg.mockResolvedValue(undefined);
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(mockGenerateExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: 'Paga Diario',
      }),
    );
  });

  it('establece el header Content-Disposition con el nombre del archivo', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('cartera-'),
    );
  });

  it('establece el Content-Type correcto para xlsx', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('envía el buffer generado con res.send', async () => {
    const fakeBuffer = Buffer.from('excel-content');
    mockGenerateExcel.mockResolvedValue(fakeBuffer);
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });

  it('mapea correctamente los campos de un schedule a PortfolioRow', async () => {
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    const callArgs = mockGenerateExcel.mock.calls[0][0];
    const row = callArgs.rows[0];
    expect(row.phone).toBe('3001234567');
    expect(row.address).toBe('Calle 1 #2-3');
    expect(row.collectorName).toBe('Carlos López');
    expect(row.amountDue).toBe('50000.00');
    expect(row.outstandingBalance).toBe('450000.00');
    expect(row.moraAmount).toBe('0.00');
  });

  it('maneja schedules sin teléfono ni dirección con strings vacíos', async () => {
    mockFindManySchedules.mockResolvedValue([
      {
        ...sampleSchedules[0],
        loan: {
          ...sampleSchedules[0].loan,
          client: {
            ...sampleSchedules[0].loan.client,
            phone: undefined,
            address: undefined,
          },
        },
      },
    ]);
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await exportReport(req, res);

    const row = mockGenerateExcel.mock.calls[0][0].rows[0];
    expect(row.phone).toBe('');
    expect(row.address).toBe('');
  });

  it('propaga errores de Prisma', async () => {
    mockFindUniqueOrg.mockRejectedValue(new Error('DB connection lost'));
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await expect(exportReport(req, res)).rejects.toThrow('DB connection lost');
  });

  it('propaga errores de generateDailyPortfolioExcel', async () => {
    mockGenerateExcel.mockRejectedValue(new Error('Excel generation failed'));
    const req = createReq({ params: { format: 'xlsx' } });
    const res = createRes();

    await expect(exportReport(req, res)).rejects.toThrow('Excel generation failed');
  });
});

// ============================================
// exportReport — formato pdf
// ============================================
describe('exportReport (pdf)', () => {
  it('encola un job en la cola pdf-generation', async () => {
    const req = createReq({ params: { format: 'pdf' } });
    const res = createRes();

    await exportReport(req, res);

    expect(mockEnqueuePdfGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        requestedBy: USER_ID,
      }),
      expect.stringContaining(`pdf-${ORG_ID}`),
    );
  });

  it('establece flashSucess en la sesión', async () => {
    const req = createReq({ params: { format: 'pdf' } });
    const res = createRes();

    await exportReport(req, res);

    expect(req.session.flashSucess).toBeDefined();
    expect(req.session.flashSucess).toContain('PDF');
  });

  it('redirige a /admin/reports', async () => {
    const req = createReq({ params: { format: 'pdf' } });
    const res = createRes();

    await exportReport(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/reports');
  });

  it('incluye reportDate en los datos del job', async () => {
    const req = createReq({ params: { format: 'pdf' } });
    const res = createRes();

    await exportReport(req, res);

    const jobData = mockEnqueuePdfGeneration.mock.calls[0][0];
    expect(jobData.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('guarda flashError en sesión si la cola falla y redirige', async () => {
    mockEnqueuePdfGeneration.mockRejectedValueOnce(new Error('Redis unavailable'));
    const req = createReq({ params: { format: 'pdf' } });
    const res = createRes();

    await exportReport(req, res);

    expect(req.session.flashError).toBe('Redis unavailable');
    expect(res.redirect).toHaveBeenCalledWith('/admin/reports');
  });
});

// ============================================
// exportReport — formato no soportado
// ============================================
describe('exportReport (formato inválido)', () => {
  it('lanza error 400 para formato csv', async () => {
    const req = createReq({ params: { format: 'csv' } });
    const res = createRes();

    await expect(exportReport(req, res)).rejects.toThrow('Formato de reporte no soportado: csv');
  });

  it('lanza error con statusCode 400', async () => {
    const req = createReq({ params: { format: 'xml' } });
    const res = createRes();

    try {
      await exportReport(req, res);
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('no llama a generateExcel ni a la cola para formatos inválidos', async () => {
    const req = createReq({ params: { format: 'txt' } });
    const res = createRes();

    try {
      await exportReport(req, res);
    } catch {
      // Expected
    }

    expect(mockGenerateExcel).not.toHaveBeenCalled();
    expect(mockEnqueuePdfGeneration).not.toHaveBeenCalled();
  });
});
