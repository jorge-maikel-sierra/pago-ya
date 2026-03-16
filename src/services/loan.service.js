import Decimal from 'decimal.js';
import prisma from '../config/prisma.js';
import { generateFixedDailySchedule } from '../engine/amortization.js';

/**
 * Lista los préstamos de una organización con filtros opcionales.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ search?: string, status?: string }} [filters]
 * @returns {Promise<Array>}
 */
export const findLoans = async (organizationId, { search, status } = {}) => {
  /** @type {import('@prisma/client').Prisma.LoanWhereInput} */
  const where = { organizationId };

  if (status && status.trim() !== '') {
    where.status = status.trim();
  }

  if (search && search.trim() !== '') {
    const term = search.trim();
    where.client = {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ],
    };
  }

  return prisma.loan.findMany({
    where,
    orderBy: { disbursementDate: 'desc' },
    select: {
      id: true,
      status: true,
      principalAmount: true,
      totalAmount: true,
      installmentAmount: true,
      outstandingBalance: true,
      numberOfPayments: true,
      paidPayments: true,
      disbursementDate: true,
      paymentFrequency: true,
      client: { select: { firstName: true, lastName: true } },
      collector: { select: { firstName: true, lastName: true } },
    },
  });
};

/**
 * Obtiene el detalle completo de un préstamo con cronograma, pagos e incidentes.
 * Lanza error 404 si el préstamo no pertenece a la organización.
 *
 * @param {string} id - UUID del préstamo
 * @param {string} organizationId - UUID de la organización (scope multi-tenant)
 * @returns {Promise<object>}
 */
export const findLoanById = async (id, organizationId) => {
  const loan = await prisma.loan.findFirst({
    where: { id, organizationId },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documentType: true,
          documentNumber: true,
          phone: true,
          address: true,
          businessName: true,
          isActive: true,
          route: { select: { id: true, name: true } },
        },
      },
      collector: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      paymentSchedule: {
        orderBy: { installmentNumber: 'asc' },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          amountDue: true,
          principalDue: true,
          interestDue: true,
          amountPaid: true,
          moraCharged: true,
          isPaid: true,
          paidAt: true,
        },
      },
      payments: {
        orderBy: { collectedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          moraAmount: true,
          totalReceived: true,
          paymentMethod: true,
          notes: true,
          collectedAt: true,
          collector: { select: { firstName: true, lastName: true } },
        },
      },
      incidents: {
        orderBy: { reportedAt: 'desc' },
        select: {
          id: true,
          type: true,
          description: true,
          reportedAt: true,
          collector: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!loan) {
    const err = new Error('Préstamo no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return loan;
};

/**
 * Obtiene los datos necesarios para el formulario de nuevo préstamo:
 * clientes activos, cobradores y rutas de la organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<{ clients: Array, collectors: Array, routes: Array }>}
 */
export const getNewLoanFormData = async (organizationId) => {
  const [clients, collectors, routes] = await Promise.all([
    prisma.client.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, documentNumber: true },
    }),
    prisma.user.findMany({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.route.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return { clients, collectors, routes };
};

/**
 * Crea un préstamo junto con su cronograma de amortización en una transacción.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ clientId: string, collectorId: string, principalAmount: number, interestRate: number, numberOfPayments: number, disbursementDate: string, paymentFrequency: string, amortizationType: string, notes?: string }} data
 * @returns {Promise<import('@prisma/client').Loan>}
 */
export const createLoan = async (organizationId, data) => {
  const {
    clientId,
    collectorId,
    principalAmount,
    interestRate,
    numberOfPayments,
    disbursementDate,
    paymentFrequency,
    amortizationType,
    notes,
  } = data;

  const amortization = generateFixedDailySchedule({
    principal: principalAmount,
    totalRate: interestRate,
    termDays: numberOfPayments,
    startDate: disbursementDate,
  });

  const principalDec = new Decimal(principalAmount);
  const totalAmountDec = new Decimal(amortization.totalAmount);
  const installmentAmountDec = new Decimal(amortization.installmentAmount);

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        organizationId,
        clientId,
        collectorId,
        status: 'ACTIVE',
        amortizationType,
        paymentFrequency,
        principalAmount: principalDec.toFixed(2),
        interestRate,
        totalAmount: totalAmountDec.toFixed(2),
        installmentAmount: installmentAmountDec.toFixed(2),
        totalPaid: '0.00',
        outstandingBalance: totalAmountDec.toFixed(2),
        moraAmount: '0.00',
        numberOfPayments,
        paidPayments: 0,
        disbursementDate: new Date(disbursementDate),
        expectedEndDate: new Date(amortization.expectedEndDate),
        notes,
      },
    });

    const scheduleData = amortization.schedule.map((inst) => ({
      loanId: loan.id,
      installmentNumber: inst.installmentNumber,
      dueDate: new Date(inst.dueDate),
      amountDue: inst.amountDue,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      amountPaid: '0.00',
      moraCharged: '0.00',
      isPaid: false,
    }));

    await tx.paymentSchedule.createMany({ data: scheduleData });

    return loan;
  });
};

/**
 * Obtiene los datos para el formulario de nuevo pago desde el panel admin:
 * préstamos activos y cobradores de la organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<{ loans: Array, collectors: Array }>}
 */
export const getNewPaymentFormData = async (organizationId) => {
  const [loans, collectors] = await Promise.all([
    prisma.loan.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: {
        id: true,
        principalAmount: true,
        outstandingBalance: true,
        installmentAmount: true,
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);

  return { loans, collectors };
};
