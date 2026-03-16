import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockRegisterPayment = jest.fn();
const mockBatchSync = jest.fn();
const mockEnqueuePaymentReceipt = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/services/payment.service.js', () => ({
  registerPayment: mockRegisterPayment,
  batchSync: mockBatchSync,
}));

jest.unstable_mockModule('../../src/services/notification.service.js', () => ({
  enqueuePaymentReceipt: mockEnqueuePaymentReceipt,
}));

jest.unstable_mockModule('../../src/utils/asyncHandler.js', () => ({
  default: (fn) => fn,
}));

const { createPayment, syncPaymentsBatch } = await import(
  '../../src/controllers/payment.controller.js'
);

// --- Helpers ---
const LOAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAYMENT_ID = '880e8400-e29b-41d4-a716-446655440000';

const createReq = (body = {}, user = {}) => ({
  body,
  user: {
    id: '660e8400-e29b-41d4-a716-446655440000',
    firstName: 'Carlos',
    lastName: 'López',
    role: 'COLLECTOR',
    ...user,
  },
  app: {
    get: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  },
});

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const nextFn = jest.fn();

describe('createPayment', () => {
  const validBody = {
    loanId: LOAN_ID,
    amountPaid: 25000,
    offlineCreatedAt: '2026-02-22T14:30:00.000Z',
  };

  const serviceResult = {
    payment: {
      id: PAYMENT_ID,
      amount: '25000.00',
      moraAmount: '0.00',
      totalReceived: '25000.00',
      collectedAt: new Date('2026-02-22T14:30:00.000Z'),
    },
    loan: {
      id: LOAN_ID,
      totalPaid: '25000.00',
      outstandingBalance: '475000.00',
      paidPayments: 1,
      status: 'ACTIVE',
    },
    clientName: 'Juan Pérez',
    clientPhone: '3001234567',
    numberOfPayments: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_CHAT_ID = '123456';
  });

  it('responde 201 con pago registrado exitosamente', async () => {
    mockRegisterPayment.mockResolvedValue(serviceResult);
    const req = createReq(validBody);
    const res = createRes();

    await createPayment(req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payment: serviceResult.payment,
          loan: expect.objectContaining({ id: LOAN_ID }),
        }),
        error: null,
      }),
    );
  });

  it('encola job de Telegram con datos correctos', async () => {
    mockRegisterPayment.mockResolvedValue(serviceResult);
    const req = createReq(validBody);
    const res = createRes();

    await createPayment(req, res, nextFn);

    expect(mockEnqueuePaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        chatId: '123456',
        clientName: 'Juan Pérez',
        collectorName: 'Carlos López',
      }),
    );
  });

  it('emite evento Socket.io payment:created', async () => {
    mockRegisterPayment.mockResolvedValue(serviceResult);
    const req = createReq(validBody);
    const res = createRes();

    await createPayment(req, res, nextFn);

    const io = req.app.get('io');
    expect(io.emit).toHaveBeenCalledWith(
      'payment:created',
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        loanId: LOAN_ID,
      }),
    );
  });

  it('no falla si io no está disponible', async () => {
    mockRegisterPayment.mockResolvedValue(serviceResult);
    const req = createReq(validBody);
    req.app.get = jest.fn().mockReturnValue(undefined);
    const res = createRes();

    await createPayment(req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('lanza errores del servicio', async () => {
    mockRegisterPayment.mockRejectedValue(new Error('DB Error'));
    const req = createReq(validBody);
    const res = createRes();

    await expect(createPayment(req, res, nextFn)).rejects.toThrow('DB Error');
  });
});

describe('syncPaymentsBatch', () => {
  const validBody = {
    payments: [
      {
        localId: 'local-1',
        loanId: LOAN_ID,
        amountPaid: 25000,
        offlineCreatedAt: '2026-02-22T14:30:00.000Z',
      },
      {
        localId: 'local-2',
        loanId: LOAN_ID,
        amountPaid: 30000,
        offlineCreatedAt: '2026-02-22T14:31:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_CHAT_ID = '123456';
  });

  it('responde 200 con resultados y resumen', async () => {
    mockBatchSync.mockResolvedValue([
      { localId: 'local-1', status: 'synced', paymentId: 'pay-1' },
      { localId: 'local-2', status: 'error', message: 'Error' },
    ]);
    const req = createReq(validBody);
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({ localId: 'local-1', status: 'synced' }),
            expect.objectContaining({ localId: 'local-2', status: 'error' }),
          ]),
          summary: {
            total: 2,
            synced: 1,
            conflicts: 0,
            errors: 1,
          },
        }),
        error: null,
      }),
    );
  });

  it('encola jobs de Telegram solo para items synced', async () => {
    mockBatchSync.mockResolvedValue([
      { localId: 'local-1', status: 'synced', paymentId: 'pay-1' },
      { localId: 'local-2', status: 'conflict', message: 'duplicado' },
    ]);
    const req = createReq(validBody);
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    expect(mockEnqueuePaymentReceipt).toHaveBeenCalledTimes(1);
    expect(mockEnqueuePaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1' }),
    );
  });

  it('emite evento Socket.io payments:batch-synced', async () => {
    mockBatchSync.mockResolvedValue([{ localId: 'local-1', status: 'synced', paymentId: 'pay-1' }]);
    const req = createReq({ payments: [validBody.payments[0]] });
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    const io = req.app.get('io');
    expect(io.emit).toHaveBeenCalledWith(
      'payments:batch-synced',
      expect.objectContaining({
        count: 1,
      }),
    );
  });

  it('no emite Socket.io si no hay items synced', async () => {
    mockBatchSync.mockResolvedValue([{ localId: 'local-1', status: 'error', message: 'fail' }]);
    const req = createReq({ payments: [validBody.payments[0]] });
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    const io = req.app.get('io');
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('no falla si io no está disponible', async () => {
    mockBatchSync.mockResolvedValue([{ localId: 'local-1', status: 'synced', paymentId: 'pay-1' }]);
    const req = createReq({ payments: [validBody.payments[0]] });
    req.app.get = jest.fn().mockReturnValue(undefined);
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lanza errores del servicio', async () => {
    mockBatchSync.mockRejectedValue(new Error('Service down'));
    const req = createReq(validBody);
    const res = createRes();

    await expect(syncPaymentsBatch(req, res, nextFn)).rejects.toThrow('Service down');
  });

  it('incluye resumen con conflicts', async () => {
    mockBatchSync.mockResolvedValue([
      { localId: 'local-1', status: 'synced', paymentId: 'pay-1' },
      { localId: 'local-2', status: 'conflict', message: 'dup' },
      { localId: 'local-3', status: 'error', message: 'fail' },
    ]);
    const req = createReq({
      payments: [
        ...validBody.payments,
        {
          localId: 'local-3',
          loanId: LOAN_ID,
          amountPaid: 10000,
          offlineCreatedAt: '2026-02-22T14:32:00.000Z',
        },
      ],
    });
    const res = createRes();

    await syncPaymentsBatch(req, res, nextFn);

    const responseData = res.json.mock.calls[0][0].data;
    expect(responseData.summary).toEqual({
      total: 3,
      synced: 1,
      conflicts: 1,
      errors: 1,
    });
  });
});
