import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockFindMany = jest.fn();
const mockGenerateLoanPDF = jest.fn();
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: { loan: { findMany: mockFindMany } },
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../src/services/pdf.service.js', () => ({
  generateLoanPDF: mockGenerateLoanPDF,
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

const mockWorkerInstance = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

let workerProcessor;

jest.unstable_mockModule('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, processor) => {
    workerProcessor = processor;
    return mockWorkerInstance;
  }),
}));

const {
  default: startPdfWorker,
  QUEUE_NAME,
  fetchLoansWithSchedule,
  transformLoanForPDF,
} = await import('../../src/jobs/pdfWorker.js');

// --- Fixtures ---
const ORG_ID = 'org-550e8400-e29b-41d4-a716-446655440000';

const sampleLoan = {
  id: 'loan-001',
  principalAmount: { toString: () => '500000.00' },
  interestRate: { toString: () => '20.00' },
  totalAmount: { toString: () => '600000.00' },
  totalPaid: { toString: () => '100000.00' },
  outstandingBalance: { toString: () => '500000.00' },
  moraAmount: { toString: () => '5000.00' },
  numberOfPayments: 30,
  paidPayments: 5,
  disbursementDate: new Date('2024-01-15'),
  expectedEndDate: new Date('2024-03-15'),
  status: 'ACTIVE',
  paymentFrequency: 'DAILY',
  client: {
    firstName: 'Ana',
    lastName: 'García',
    documentNumber: '1098765432',
  },
  collector: {
    firstName: 'Carlos',
    lastName: 'López',
  },
  paymentSchedule: [
    {
      installmentNumber: 1,
      dueDate: new Date('2024-01-16'),
      amountDue: { toString: () => '20000.00' },
      principalDue: { toString: () => '16666.67' },
      interestDue: { toString: () => '3333.33' },
      amountPaid: { toString: () => '20000.00' },
      isPaid: true,
    },
    {
      installmentNumber: 2,
      dueDate: new Date('2024-01-17'),
      amountDue: { toString: () => '20000.00' },
      principalDue: { toString: () => '16666.67' },
      interestDue: { toString: () => '3333.33' },
      amountPaid: { toString: () => '0.00' },
      isPaid: false,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

// ============================================
// Exports
// ============================================
describe('pdfWorker exports', () => {
  it('exporta QUEUE_NAME como pdf-generation', () => {
    expect(QUEUE_NAME).toBe('pdf-generation');
  });
});

// ============================================
// transformLoanForPDF
// ============================================
describe('transformLoanForPDF', () => {
  it('transforma un préstamo Prisma al formato esperado', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.loanSummary).toEqual(
      expect.objectContaining({
        clientName: 'Ana García',
        documentNumber: '1098765432',
        collectorName: 'Carlos López',
        principalAmount: '500000.00',
        status: 'ACTIVE',
        paymentFrequency: 'DAILY',
      }),
    );
  });

  it('convierte disbursementDate a formato YYYY-MM-DD', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.loanSummary.disbursementDate).toBe('2024-01-15');
  });

  it('convierte expectedEndDate a formato YYYY-MM-DD', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.loanSummary.expectedEndDate).toBe('2024-03-15');
  });

  it('convierte montos Decimal a string', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.loanSummary.interestRate).toBe('20.00');
    expect(result.loanSummary.totalAmount).toBe('600000.00');
    expect(result.loanSummary.totalPaid).toBe('100000.00');
    expect(result.loanSummary.outstandingBalance).toBe('500000.00');
    expect(result.loanSummary.moraAmount).toBe('5000.00');
  });

  it('preserva campos numéricos sin conversión', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.loanSummary.numberOfPayments).toBe(30);
    expect(result.loanSummary.paidPayments).toBe(5);
  });

  it('transforma el schedule correctamente', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]).toEqual({
      installmentNumber: 1,
      dueDate: '2024-01-16',
      amountDue: '20000.00',
      principalDue: '16666.67',
      interestDue: '3333.33',
      amountPaid: '20000.00',
      isPaid: true,
    });
  });

  it('mantiene el isPaid como booleano en el schedule', () => {
    const result = transformLoanForPDF(sampleLoan);

    expect(result.schedule[0].isPaid).toBe(true);
    expect(result.schedule[1].isPaid).toBe(false);
  });
});

// ============================================
// fetchLoansWithSchedule
// ============================================
describe('fetchLoansWithSchedule', () => {
  it('consulta préstamos ACTIVE de la organización', async () => {
    mockFindMany.mockResolvedValue([sampleLoan]);

    const result = await fetchLoansWithSchedule(ORG_ID);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID, status: 'ACTIVE' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('retorna array vacío si no hay préstamos', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await fetchLoansWithSchedule(ORG_ID);

    expect(result).toEqual([]);
  });

  it('propaga errores de Prisma', async () => {
    mockFindMany.mockRejectedValue(new Error('DB timeout'));

    await expect(fetchLoansWithSchedule(ORG_ID)).rejects.toThrow('DB timeout');
  });
});

// ============================================
// startPdfWorker
// ============================================
describe('startPdfWorker', () => {
  describe('configuration', () => {
    it('retorna una instancia del worker', () => {
      const worker = startPdfWorker();

      expect(worker).toBeDefined();
    });

    it('registra event handlers completed y failed', () => {
      startPdfWorker();

      expect(mockWorkerInstance.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });
  });

  describe('event handlers', () => {
    it('logs en completed con filename', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      startPdfWorker();

      const completedHandler = mockWorkerInstance.on.mock.calls.find(
        (call) => call[0] === 'completed',
      )[1];
      completedHandler({ id: 'job-1' }, { filename: 'reporte-org-2024-01-15.pdf' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('job-1'));
      consoleSpy.mockRestore();
    });

    it('logs en completed con message cuando no hay filename', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      startPdfWorker();

      const completedHandler = mockWorkerInstance.on.mock.calls.find(
        (call) => call[0] === 'completed',
      )[1];
      completedHandler({ id: 'job-2' }, { status: 'empty', message: 'No hay préstamos activos' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No hay préstamos activos'));
      consoleSpy.mockRestore();
    });

    it('logs errores en failed', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      startPdfWorker();

      const failedHandler = mockWorkerInstance.on.mock.calls.find(
        (call) => call[0] === 'failed',
      )[1];
      failedHandler(
        { id: 'job-3', attemptsMade: 1, opts: { attempts: 3 } },
        new Error('PDF generation failed'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('job-3'),
        'PDF generation failed',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('job processing', () => {
    it('crea el directorio uploads si no existe', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([sampleLoan]);
      mockGenerateLoanPDF.mockResolvedValue(Buffer.from('pdf-content'));

      await workerProcessor({
        data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
      });

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('uploads'), {
        recursive: true,
      });
    });

    it('genera PDF y guarda archivo para préstamos activos', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([sampleLoan]);
      const fakePdf = Buffer.from('pdf-binary-content');
      mockGenerateLoanPDF.mockResolvedValue(fakePdf);

      const result = await workerProcessor({
        data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
      });

      expect(mockGenerateLoanPDF).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('.pdf'), fakePdf);
      expect(result.status).toBe('completed');
      expect(result.filename).toContain('.pdf');
      expect(result.loansProcessed).toBe(1);
      expect(result.size).toBe(fakePdf.length);
    });

    it('retorna status empty cuando no hay préstamos', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([]);

      const result = await workerProcessor({
        data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
      });

      expect(result.status).toBe('empty');
      expect(result.message).toBeDefined();
      expect(mockGenerateLoanPDF).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('usa el organizationId truncado en el nombre del archivo', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([sampleLoan]);
      mockGenerateLoanPDF.mockResolvedValue(Buffer.from('pdf'));

      const result = await workerProcessor({
        data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
      });

      expect(result.filename).toContain(ORG_ID.slice(0, 8));
      expect(result.filename).toContain('2024-01-15');
    });

    it('propaga errores de Prisma', async () => {
      startPdfWorker();
      mockFindMany.mockRejectedValue(new Error('Connection refused'));

      await expect(
        workerProcessor({
          data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
        }),
      ).rejects.toThrow('Connection refused');
    });

    it('propaga errores de generateLoanPDF', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([sampleLoan]);
      mockGenerateLoanPDF.mockRejectedValue(new Error('PDF lib error'));

      await expect(
        workerProcessor({
          data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
        }),
      ).rejects.toThrow('PDF lib error');
    });

    it('propaga errores de writeFile', async () => {
      startPdfWorker();
      mockFindMany.mockResolvedValue([sampleLoan]);
      mockGenerateLoanPDF.mockResolvedValue(Buffer.from('pdf'));
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(
        workerProcessor({
          data: { organizationId: ORG_ID, reportDate: '2024-01-15' },
        }),
      ).rejects.toThrow('EACCES: permission denied');
    });
  });
});
