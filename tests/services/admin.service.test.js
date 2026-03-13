import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockLoanCount = jest.fn();
const mockClientCount = jest.fn();
const mockUserCount = jest.fn();
const mockLoanAggregate = jest.fn();
const mockPaymentAggregate = jest.fn();
const mockScheduleCount = jest.fn();
const mockScheduleFindMany = jest.fn();
const mockPaymentFindMany = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    loan: { count: mockLoanCount, aggregate: mockLoanAggregate },
    client: { count: mockClientCount },
    user: { count: mockUserCount },
    payment: { aggregate: mockPaymentAggregate, findMany: mockPaymentFindMany },
    paymentSchedule: { count: mockScheduleCount, findMany: mockScheduleFindMany },
  },
}));

jest.unstable_mockModule('decimal.js', () => {
  class FakeDecimal {
    constructor(val) {
      this.val = Number(val || 0);
    }

    toFixed(n) {
      return this.val.toFixed(n);
    }
  }
  return { default: FakeDecimal };
});

const { getDashboardKPIs } = await import('../../src/services/admin.service.js');

// --- Fixtures ---
const ORG_ID = 'org-550e8400-e29b-41d4-a716-446655440000';

const baseSums = {
  _sum: {
    principalAmount: '5000000.00',
    totalPaid: '1500000.00',
    outstandingBalance: '3500000.00',
    moraAmount: '250000.00',
  },
};

const baseTodayAgg = {
  _sum: { totalReceived: '120000.00' },
  _count: 5,
};

const baseMoraAlert = {
  id: 'sched-001',
  installmentNumber: 3,
  dueDate: new Date('2026-01-15'),
  amountDue: '25000.00',
  amountPaid: '0.00',
  loan: {
    id: 'loan-001',
    client: { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' },
    collector: { firstName: 'Carlos', lastName: 'López' },
  },
};

const baseRecentPayment = {
  id: 'pay-001',
  amount: '25000.00',
  totalReceived: '25000.00',
  collectedAt: new Date('2026-02-20T14:00:00.000Z'),
  loan: { client: { firstName: 'Ana', lastName: 'García' } },
  collector: { firstName: 'Carlos', lastName: 'López' },
};

describe('getDashboardKPIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockLoanCount.mockResolvedValue(15);
    mockClientCount.mockResolvedValue(42);
    mockUserCount.mockResolvedValue(5);
    mockLoanAggregate.mockResolvedValue(baseSums);
    mockPaymentAggregate.mockResolvedValue(baseTodayAgg);
    mockScheduleCount.mockResolvedValue(8);
    mockScheduleFindMany.mockResolvedValue([baseMoraAlert]);
    mockPaymentFindMany.mockResolvedValue([baseRecentPayment]);
  });

  it('retorna los 12 campos esperados del KPI', async () => {
    const result = await getDashboardKPIs(ORG_ID);

    expect(result).toEqual(
      expect.objectContaining({
        activeLoans: expect.any(Number),
        totalClients: expect.any(Number),
        totalCollectors: expect.any(Number),
        totalDisbursed: expect.any(String),
        totalCollected: expect.any(String),
        totalOutstanding: expect.any(String),
        totalMora: expect.any(String),
        todayCollected: expect.any(String),
        todayPayments: expect.any(Number),
        overdueSchedules: expect.any(Number),
        moraAlerts: expect.any(Array),
        recentPayments: expect.any(Array),
      }),
    );
  });

  it('retorna contadores correctos', async () => {
    const result = await getDashboardKPIs(ORG_ID);

    expect(result.activeLoans).toBe(15);
    expect(result.totalClients).toBe(42);
    expect(result.totalCollectors).toBe(5);
    expect(result.todayPayments).toBe(5);
    expect(result.overdueSchedules).toBe(8);
  });

  it('retorna montos financieros formateados a 2 decimales', async () => {
    const result = await getDashboardKPIs(ORG_ID);

    expect(result.totalDisbursed).toBe('5000000.00');
    expect(result.totalCollected).toBe('1500000.00');
    expect(result.totalOutstanding).toBe('3500000.00');
    expect(result.totalMora).toBe('250000.00');
    expect(result.todayCollected).toBe('120000.00');
  });

  it('retorna moraAlerts con estructura de loan+client+collector', async () => {
    const result = await getDashboardKPIs(ORG_ID);

    expect(result.moraAlerts).toHaveLength(1);
    expect(result.moraAlerts[0]).toEqual(
      expect.objectContaining({
        id: 'sched-001',
        installmentNumber: 3,
        loan: expect.objectContaining({
          client: expect.objectContaining({ firstName: 'Juan' }),
          collector: expect.objectContaining({ firstName: 'Carlos' }),
        }),
      }),
    );
  });

  it('retorna recentPayments con estructura de loan.client y collector', async () => {
    const result = await getDashboardKPIs(ORG_ID);

    expect(result.recentPayments).toHaveLength(1);
    expect(result.recentPayments[0]).toEqual(
      expect.objectContaining({
        id: 'pay-001',
        loan: expect.objectContaining({
          client: expect.objectContaining({ firstName: 'Ana' }),
        }),
        collector: expect.objectContaining({ firstName: 'Carlos' }),
      }),
    );
  });

  it('filtra por organizationId en loan.count', async () => {
    await getDashboardKPIs(ORG_ID);

    expect(mockLoanCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      }),
    );
  });

  it('filtra cobradores activos por rol COLLECTOR', async () => {
    await getDashboardKPIs(ORG_ID);

    expect(mockUserCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          role: 'COLLECTOR',
          isActive: true,
        }),
      }),
    );
  });

  it('maneja sumas nulas correctamente (retorna "0.00")', async () => {
    mockLoanAggregate.mockResolvedValue({
      _sum: {
        principalAmount: undefined,
        totalPaid: undefined,
        outstandingBalance: undefined,
        moraAmount: undefined,
      },
    });
    mockPaymentAggregate.mockResolvedValue({
      _sum: { totalReceived: undefined },
      _count: 0,
    });

    const result = await getDashboardKPIs(ORG_ID);

    expect(result.totalDisbursed).toBe('0.00');
    expect(result.totalCollected).toBe('0.00');
    expect(result.totalOutstanding).toBe('0.00');
    expect(result.totalMora).toBe('0.00');
    expect(result.todayCollected).toBe('0.00');
    expect(result.todayPayments).toBe(0);
  });

  it('retorna arrays vacíos cuando no hay mora ni pagos', async () => {
    mockScheduleFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);

    const result = await getDashboardKPIs(ORG_ID);

    expect(result.moraAlerts).toEqual([]);
    expect(result.recentPayments).toEqual([]);
  });

  it('ejecuta todas las queries en paralelo (8 llamadas a Prisma)', async () => {
    await getDashboardKPIs(ORG_ID);

    expect(mockLoanCount).toHaveBeenCalledTimes(1);
    expect(mockClientCount).toHaveBeenCalledTimes(1);
    expect(mockUserCount).toHaveBeenCalledTimes(1);
    expect(mockLoanAggregate).toHaveBeenCalledTimes(1);
    expect(mockPaymentAggregate).toHaveBeenCalledTimes(1);
    expect(mockScheduleCount).toHaveBeenCalledTimes(1);
    expect(mockScheduleFindMany).toHaveBeenCalledTimes(1);
    expect(mockPaymentFindMany).toHaveBeenCalledTimes(1);
  });

  it('busca cuotas vencidas anteriores a hoy con isPaid=false', async () => {
    await getDashboardKPIs(ORG_ID);

    const scheduleCountCall = mockScheduleCount.mock.calls[0][0];
    expect(scheduleCountCall.where.isPaid).toBe(false);
    expect(scheduleCountCall.where.dueDate.lt).toBeInstanceOf(Date);
    expect(scheduleCountCall.where.loan.status).toBe('ACTIVE');
  });

  it('limita moraAlerts a 20 registros ordenados por dueDate asc', async () => {
    await getDashboardKPIs(ORG_ID);

    const findManyCall = mockScheduleFindMany.mock.calls[0][0];
    expect(findManyCall.take).toBe(20);
    expect(findManyCall.orderBy).toEqual({ dueDate: 'asc' });
  });

  it('limita recentPayments a 10 registros ordenados por collectedAt desc', async () => {
    await getDashboardKPIs(ORG_ID);

    const findManyCall = mockPaymentFindMany.mock.calls[0][0];
    expect(findManyCall.take).toBe(10);
    expect(findManyCall.orderBy).toEqual({ collectedAt: 'desc' });
  });
});
