import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockFindUniqueOrThrow = jest.fn();
const mockLoanUpdate = jest.fn();
const mockScheduleUpdate = jest.fn();
const mockLoanFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    loan: {
      findUniqueOrThrow: mockFindUniqueOrThrow,
      update: mockLoanUpdate,
      findMany: mockLoanFindMany,
    },
    paymentSchedule: { update: mockScheduleUpdate },
    $transaction: mockTransaction,
  },
}));

const {
  calculateAndUpdateLoanMora,
  findActiveLoansWithOverdueSchedules,
  processMoraForOrganization,
} = await import('../../src/services/mora.service.js');

// --- Fixtures ---
const LOAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const ORG_ID = 'org-550e8400-e29b-41d4-a716-446655440000';

// Fecha pasada para simular cuotas vencidas
const overdueDate = new Date('2026-02-01T00:00:00.000Z');
// Fecha futura para simular cuotas al día
const futureDate = new Date('2099-01-01T00:00:00.000Z');

const baseLoan = {
  id: LOAN_ID,
  // 10% diario — tasa alta de ejemplo para pruebas
  interestRate: '0.10',
  moraAmount: '0.00',
  paymentSchedule: [],
};

// ============================================
// calculateAndUpdateLoanMora
// ============================================
describe('calculateAndUpdateLoanMora', () => {
  // tx simulado que expone loan y paymentSchedule
  const mockTx = {
    loan: { findUniqueOrThrow: mockFindUniqueOrThrow, update: mockLoanUpdate },
    paymentSchedule: { update: mockScheduleUpdate },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleUpdate.mockResolvedValue({});
    mockTransaction.mockImplementation((fn) => fn(mockTx));
  });

  it('actualiza moraAmount a 0 cuando no hay cuotas vencidas', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      paymentSchedule: [
        { id: 'sched-1', dueDate: futureDate, amountDue: '20000.00', amountPaid: '0.00' },
      ],
    });
    mockLoanUpdate.mockResolvedValue({ id: LOAN_ID, moraAmount: '0.00' });

    const result = await calculateAndUpdateLoanMora(LOAN_ID);

    expect(mockLoanUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { moraAmount: '0.00' },
      }),
    );
    expect(result.overdueSchedules).toBe(0);
    expect(result.moraAmount).toBe('0.00');
  });

  it('calcula mora sobre el saldo impago de cuotas vencidas', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      // interestRate: 0.10, multiplier 1.5 → moraRate = 0.15 por día
      // saldo impago: 20000, días vencidos: calculados desde 2026-02-01 hasta hoy
      paymentSchedule: [
        { id: 'sched-1', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '5000.00' },
      ],
    });
    mockLoanUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: LOAN_ID, moraAmount: data.moraAmount }),
    );

    const result = await calculateAndUpdateLoanMora(LOAN_ID);

    expect(result.overdueSchedules).toBe(1);
    // Con saldo impago de 15000 y días vencidos > 0, la mora debe ser > 0
    expect(parseFloat(result.moraAmount)).toBeGreaterThan(0);
  });

  it('ignora cuotas con saldo totalmente pagado aunque estén vencidas', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      paymentSchedule: [
        // amountPaid == amountDue → saldo impago = 0
        { id: 'sched-1', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '20000.00' },
      ],
    });
    mockLoanUpdate.mockResolvedValue({ id: LOAN_ID, moraAmount: '0.00' });

    const result = await calculateAndUpdateLoanMora(LOAN_ID);

    expect(result.overdueSchedules).toBe(0);
    expect(mockLoanUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moraAmount: '0.00' } }),
    );
  });

  it('acumula mora de múltiples cuotas vencidas', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      paymentSchedule: [
        { id: 'sched-1', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '0.00' },
        { id: 'sched-2', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '0.00' },
      ],
    });
    mockLoanUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: LOAN_ID, moraAmount: data.moraAmount }),
    );

    const result = await calculateAndUpdateLoanMora(LOAN_ID);

    expect(result.overdueSchedules).toBe(2);
    expect(parseFloat(result.moraAmount)).toBeGreaterThan(0);
  });

  it('retorna el loanId correcto en el resultado', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ ...baseLoan, paymentSchedule: [] });
    mockLoanUpdate.mockResolvedValue({ id: LOAN_ID, moraAmount: '0.00' });

    const result = await calculateAndUpdateLoanMora(LOAN_ID);

    expect(result.loanId).toBe(LOAN_ID);
  });

  it('actualiza moraCharged en cada cuota vencida con saldo impago', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      paymentSchedule: [
        { id: 'sched-1', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '0.00' },
        { id: 'sched-2', dueDate: futureDate, amountDue: '20000.00', amountPaid: '0.00' },
      ],
    });
    mockLoanUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: LOAN_ID, moraAmount: data.moraAmount }),
    );

    await calculateAndUpdateLoanMora(LOAN_ID);

    // sched-1 (vencida): moraCharged debe ser > 0
    const overdueCall = mockScheduleUpdate.mock.calls.find(
      (c) => c[0].where.id === 'sched-1',
    );
    expect(parseFloat(overdueCall[0].data.moraCharged)).toBeGreaterThan(0);

    // sched-2 (futura): moraCharged debe resetearse a '0.00'
    const futureCall = mockScheduleUpdate.mock.calls.find(
      (c) => c[0].where.id === 'sched-2',
    );
    expect(futureCall[0].data.moraCharged).toBe('0.00');
  });

  it('resetea moraCharged a 0 en cuotas con saldo totalmente pagado', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      ...baseLoan,
      paymentSchedule: [
        { id: 'sched-paid', dueDate: overdueDate, amountDue: '20000.00', amountPaid: '20000.00' },
      ],
    });
    mockLoanUpdate.mockResolvedValue({ id: LOAN_ID, moraAmount: '0.00' });

    await calculateAndUpdateLoanMora(LOAN_ID);

    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moraCharged: '0.00' } }),
    );
  });
});

// ============================================
// findActiveLoansWithOverdueSchedules
// ============================================
describe('findActiveLoansWithOverdueSchedules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('consulta solo préstamos ACTIVE con cuotas vencidas e impagas', async () => {
    mockLoanFindMany.mockResolvedValue([{ id: LOAN_ID }]);

    await findActiveLoansWithOverdueSchedules(ORG_ID);

    expect(mockLoanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          status: 'ACTIVE',
          paymentSchedule: {
            some: expect.objectContaining({ isPaid: false }),
          },
        }),
      }),
    );
  });

  it('retorna array de loanIds', async () => {
    mockLoanFindMany.mockResolvedValue([{ id: 'loan-1' }, { id: 'loan-2' }]);

    const ids = await findActiveLoansWithOverdueSchedules(ORG_ID);

    expect(ids).toEqual(['loan-1', 'loan-2']);
  });

  it('retorna array vacío cuando no hay préstamos con mora', async () => {
    mockLoanFindMany.mockResolvedValue([]);

    const ids = await findActiveLoansWithOverdueSchedules(ORG_ID);

    expect(ids).toEqual([]);
  });
});

// ============================================
// processMoraForOrganization
// ============================================
describe('processMoraForOrganization', () => {
  const mockTxFull = {
    loan: { findUniqueOrThrow: mockFindUniqueOrThrow, update: mockLoanUpdate },
    paymentSchedule: { update: mockScheduleUpdate },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleUpdate.mockResolvedValue({});
    mockTransaction.mockImplementation((fn) => fn(mockTxFull));
  });

  it('retorna ceros cuando no hay préstamos con mora', async () => {
    mockLoanFindMany.mockResolvedValue([]);

    const result = await processMoraForOrganization(ORG_ID);

    expect(result).toEqual({ processed: 0, errors: 0, totalMora: '0.00' });
  });

  it('procesa cada préstamo y acumula la mora total', async () => {
    mockLoanFindMany.mockResolvedValue([{ id: 'loan-1' }, { id: 'loan-2' }]);
    mockFindUniqueOrThrow.mockResolvedValue({ ...baseLoan, paymentSchedule: [] });
    mockLoanUpdate.mockResolvedValue({ id: 'loan-1', moraAmount: '0.00' });

    const result = await processMoraForOrganization(ORG_ID);

    expect(result.processed).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('cuenta errores sin lanzar excepción cuando un préstamo falla', async () => {
    mockLoanFindMany.mockResolvedValue([{ id: 'loan-ok' }, { id: 'loan-fail' }]);

    // Primer préstamo exitoso, segundo falla
    mockTransaction
      .mockImplementationOnce((fn) =>
        fn({
          loan: {
            findUniqueOrThrow: jest
              .fn()
              .mockResolvedValue({ ...baseLoan, id: 'loan-ok', paymentSchedule: [] }),
            update: jest.fn().mockResolvedValue({ id: 'loan-ok', moraAmount: '0.00' }),
          },
          paymentSchedule: { update: jest.fn().mockResolvedValue({}) },
        }),
      )
      .mockImplementationOnce(() => Promise.reject(new Error('DB error simulado')));

    const result = await processMoraForOrganization(ORG_ID);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
  });
});
