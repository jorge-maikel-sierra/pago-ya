import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockCount = jest.fn();
const mockTransaction = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    loan: { findUnique: mockFindUnique, update: mockUpdate },
    paymentSchedule: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      update: mockUpdate,
      count: mockCount,
    },
    payment: { create: mockCreate },
    $transaction: mockTransaction,
  },
}));

const { processPayment, registerPayment, batchSync } = await import(
  '../../src/services/payment.service.js'
);

// --- Fixtures ---
const LOAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const COLLECTOR_ID = '660e8400-e29b-41d4-a716-446655440000';
const SCHEDULE_ID = '770e8400-e29b-41d4-a716-446655440000';
const PAYMENT_ID = '880e8400-e29b-41d4-a716-446655440000';

const baseLoan = {
  id: LOAN_ID,
  status: 'ACTIVE',
  totalPaid: '0.00',
  totalAmount: '500000.00',
  outstandingBalance: '500000.00',
  paidPayments: 0,
  numberOfPayments: 20,
  client: { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' },
};

const baseSchedule = {
  id: SCHEDULE_ID,
  loanId: LOAN_ID,
  amountDue: '25000.00',
  amountPaid: '0.00',
  isPaid: false,
};

const baseInput = {
  loanId: LOAN_ID,
  amountPaid: 25000,
  offlineCreatedAt: '2026-02-22T14:30:00.000Z',
  collectorId: COLLECTOR_ID,
};

describe('processPayment', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      loan: { findUnique: jest.fn(), update: jest.fn() },
      paymentSchedule: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      payment: { create: jest.fn() },
    };
  });

  it('registra un pago correctamente con cuota automática', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findFirst.mockResolvedValue(baseSchedule);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date('2026-02-22T14:30:00.000Z'),
    });
    mockDb.paymentSchedule.update.mockResolvedValue({
      ...baseSchedule,
      amountPaid: '25000.00',
      isPaid: true,
    });
    mockDb.paymentSchedule.count.mockResolvedValue(1);
    mockDb.loan.update.mockResolvedValue({
      ...baseLoan,
      totalPaid: '25000.00',
      outstandingBalance: '475000.00',
      paidPayments: 1,
      status: 'ACTIVE',
    });

    const result = await processPayment(baseInput, mockDb);

    expect(result.payment.id).toBe(PAYMENT_ID);
    expect(result.loan.totalPaid).toBe('25000.00');
    expect(result.clientName).toBe('Juan Pérez');
    expect(mockDb.payment.create).toHaveBeenCalledTimes(1);
    expect(mockDb.paymentSchedule.update).toHaveBeenCalledTimes(1);
    expect(mockDb.loan.update).toHaveBeenCalledTimes(1);
  });

  it('registra un pago con paymentScheduleId explícito', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findUnique.mockResolvedValue(baseSchedule);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date(),
    });
    mockDb.paymentSchedule.update.mockResolvedValue({
      ...baseSchedule,
      amountPaid: '25000.00',
      isPaid: true,
    });
    mockDb.paymentSchedule.count.mockResolvedValue(1);
    mockDb.loan.update.mockResolvedValue({
      ...baseLoan,
      totalPaid: '25000.00',
      outstandingBalance: '475000.00',
      paidPayments: 1,
    });

    const result = await processPayment({ ...baseInput, paymentScheduleId: SCHEDULE_ID }, mockDb);

    expect(result.payment.id).toBe(PAYMENT_ID);
    expect(mockDb.paymentSchedule.findUnique).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID } });
  });

  it('lanza error 404 si el préstamo no existe', async () => {
    mockDb.loan.findUnique.mockResolvedValue(undefined);

    await expect(processPayment(baseInput, mockDb)).rejects.toThrow('Préstamo no encontrado');
  });

  it('lanza error 409 si el préstamo no está activo', async () => {
    mockDb.loan.findUnique.mockResolvedValue({ ...baseLoan, status: 'COMPLETED' });

    await expect(processPayment(baseInput, mockDb)).rejects.toThrow('no está activo');
  });

  it('lanza error 404 si paymentScheduleId no pertenece al préstamo', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findUnique.mockResolvedValue({
      ...baseSchedule,
      loanId: 'otro-loan-id',
    });

    await expect(
      processPayment({ ...baseInput, paymentScheduleId: SCHEDULE_ID }, mockDb),
    ).rejects.toThrow('Cuota del cronograma no encontrada');
  });

  it('lanza error 404 si paymentScheduleId no existe', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findUnique.mockResolvedValue(undefined);

    await expect(
      processPayment({ ...baseInput, paymentScheduleId: SCHEDULE_ID }, mockDb),
    ).rejects.toThrow('Cuota del cronograma no encontrada');
  });

  it('registra pago sin cuota disponible (schedule = undefined)', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findFirst.mockResolvedValue(undefined);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date(),
    });
    mockDb.paymentSchedule.count.mockResolvedValue(0);
    mockDb.loan.update.mockResolvedValue({
      ...baseLoan,
      totalPaid: '25000.00',
      outstandingBalance: '475000.00',
    });

    const result = await processPayment(baseInput, mockDb);

    expect(result.payment.id).toBe(PAYMENT_ID);
    expect(result.schedule).toBeUndefined();
  });

  it('marca cuota como parcialmente pagada si monto es menor al due', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findFirst.mockResolvedValue(baseSchedule);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '10000.00',
      moraAmount: '0.00',
      totalReceived: '10000.00',
      collectedAt: new Date(),
    });
    mockDb.paymentSchedule.update.mockResolvedValue({
      ...baseSchedule,
      amountPaid: '10000.00',
      isPaid: false,
    });
    mockDb.paymentSchedule.count.mockResolvedValue(0);
    mockDb.loan.update.mockResolvedValue({
      ...baseLoan,
      totalPaid: '10000.00',
      outstandingBalance: '490000.00',
    });

    const result = await processPayment({ ...baseInput, amountPaid: 10000 }, mockDb);

    const updateCall = mockDb.paymentSchedule.update.mock.calls[0][0];
    expect(updateCall.data.isPaid).toBe(false);
    expect(result.schedule.isPaid).toBe(false);
  });

  it('cambia estado del préstamo a COMPLETED cuando se paga todo', async () => {
    const almostPaidLoan = { ...baseLoan, totalPaid: '475000.00', totalAmount: '500000.00' };
    mockDb.loan.findUnique.mockResolvedValue(almostPaidLoan);
    mockDb.paymentSchedule.findFirst.mockResolvedValue(baseSchedule);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date(),
    });
    mockDb.paymentSchedule.update.mockResolvedValue({
      ...baseSchedule,
      amountPaid: '25000.00',
      isPaid: true,
    });
    mockDb.paymentSchedule.count.mockResolvedValue(20);
    mockDb.loan.update.mockResolvedValue({
      ...almostPaidLoan,
      totalPaid: '500000.00',
      outstandingBalance: '0.00',
      status: 'COMPLETED',
    });

    await processPayment(baseInput, mockDb);

    const loanUpdateCall = mockDb.loan.update.mock.calls[0][0];
    expect(loanUpdateCall.data.status).toBe('COMPLETED');
    expect(loanUpdateCall.data.actualEndDate).toBeDefined();
  });

  it('incluye latitude y longitude en el pago creado', async () => {
    mockDb.loan.findUnique.mockResolvedValue(baseLoan);
    mockDb.paymentSchedule.findFirst.mockResolvedValue(baseSchedule);
    mockDb.payment.create.mockResolvedValue({
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date(),
    });
    mockDb.paymentSchedule.update.mockResolvedValue({
      ...baseSchedule,
      amountPaid: '25000.00',
      isPaid: true,
    });
    mockDb.paymentSchedule.count.mockResolvedValue(1);
    mockDb.loan.update.mockResolvedValue({
      ...baseLoan,
      totalPaid: '25000.00',
      outstandingBalance: '475000.00',
    });

    await processPayment({ ...baseInput, latitude: 4.609, longitude: -74.081 }, mockDb);

    const createCall = mockDb.payment.create.mock.calls[0][0];
    expect(createCall.data.latitude).toBe(4.609);
    expect(createCall.data.longitude).toBe(-74.081);
  });
});

describe('registerPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ejecuta processPayment dentro de una transacción', async () => {
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        loan: {
          findUnique: jest.fn().mockResolvedValue(baseLoan),
          update: jest.fn().mockResolvedValue(baseLoan),
        },
        paymentSchedule: {
          findFirst: jest.fn().mockResolvedValue(baseSchedule),
          update: jest.fn().mockResolvedValue(baseSchedule),
          count: jest.fn().mockResolvedValue(1),
        },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: PAYMENT_ID,
            amount: '25000.00',
            moraAmount: '0.00',
            totalReceived: '25000.00',
            collectedAt: new Date(),
          }),
        },
      }),
    );

    const result = await registerPayment(baseInput);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(result.payment.id).toBe(PAYMENT_ID);
  });

  it('propaga errores de la transacción', async () => {
    mockTransaction.mockRejectedValue(new Error('DB Error'));

    await expect(registerPayment(baseInput)).rejects.toThrow('DB Error');
  });
});

describe('batchSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('procesa múltiples pagos y retorna estado por cada uno', async () => {
    let callCount = 0;
    mockTransaction.mockImplementation(async (fn) => {
      callCount += 1;
      if (callCount === 2) {
        const err = new Error('El préstamo no está activo');
        err.statusCode = 409;
        throw err;
      }
      return fn({
        loan: {
          findUnique: jest.fn().mockResolvedValue(baseLoan),
          update: jest.fn().mockResolvedValue(baseLoan),
        },
        paymentSchedule: {
          findFirst: jest.fn().mockResolvedValue(baseSchedule),
          update: jest.fn().mockResolvedValue(baseSchedule),
          count: jest.fn().mockResolvedValue(1),
        },
        payment: {
          create: jest.fn().mockResolvedValue({
            id: `pay-${callCount}`,
            amount: '25000.00',
            moraAmount: '0.00',
            totalReceived: '25000.00',
            collectedAt: new Date(),
          }),
        },
      });
    });

    const items = [
      {
        localId: 'local-1',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:30:00.000Z',
      },
      {
        localId: 'local-2',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:31:00.000Z',
      },
      {
        localId: 'local-3',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:32:00.000Z',
      },
    ];

    const results = await batchSync(items, COLLECTOR_ID);

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('synced');
    expect(results[0].paymentId).toBeDefined();
    expect(results[1].status).toBe('conflict');
    expect(results[1].message).toBeDefined();
    expect(results[2].status).toBe('synced');
  });

  it('retorna conflict para errores P2002 (duplicado)', async () => {
    const prismaErr = new Error('Unique constraint');
    prismaErr.code = 'P2002';
    mockTransaction.mockRejectedValue(prismaErr);

    const items = [
      {
        localId: 'local-1',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:30:00.000Z',
      },
    ];
    const results = await batchSync(items, COLLECTOR_ID);

    expect(results[0].status).toBe('conflict');
  });

  it('retorna error para errores genéricos', async () => {
    mockTransaction.mockRejectedValue(new Error('DB connection lost'));

    const items = [
      {
        localId: 'local-1',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:30:00.000Z',
      },
    ];
    const results = await batchSync(items, COLLECTOR_ID);

    expect(results[0].status).toBe('error');
    expect(results[0].message).toBe('DB connection lost');
  });

  it('retorna array vacío si se pasa array vacío', async () => {
    const results = await batchSync([], COLLECTOR_ID);
    expect(results).toEqual([]);
  });
});
