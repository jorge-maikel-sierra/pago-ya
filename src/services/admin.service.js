import Decimal from 'decimal.js';
import prisma from '../config/prisma.js';

/**
 * @typedef {object} DashboardKPIs
 * @property {number} activeLoans - Préstamos activos
 * @property {number} totalClients - Clientes registrados
 * @property {number} totalCollectors - Cobradores activos
 * @property {string} totalDisbursed - Capital total desembolsado (Decimal string)
 * @property {string} totalCollected - Total recaudado (Decimal string)
 * @property {string} totalOutstanding - Saldo pendiente total (Decimal string)
 * @property {string} todayCollected - Recaudación del día (Decimal string)
 * @property {number} todayPayments - Pagos registrados hoy
 * @property {number} overdueSchedules - Cuotas vencidas no pagadas
 * @property {string} totalMora - Mora acumulada total (Decimal string)
 * @property {Array} moraAlerts - Alertas de cuotas en mora
 * @property {Array} recentPayments - Últimos 10 pagos
 */

/**
 * Obtiene los KPIs del dashboard del panel de administración.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<DashboardKPIs>}
 */
const getDashboardKPIs = async (organizationId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    activeLoans,
    totalClients,
    totalCollectors,
    loanAggregates,
    todayPaymentsAgg,
    overdueSchedules,
    moraAlerts,
    recentPayments,
  ] = await Promise.all([
    prisma.loan.count({
      where: { organizationId, status: 'ACTIVE' },
    }),

    prisma.client.count({
      where: {
        isActive: true,
        loans: { some: { organizationId } },
      },
    }),

    prisma.user.count({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
    }),

    prisma.loan.aggregate({
      where: { organizationId, status: { in: ['ACTIVE', 'COMPLETED', 'DEFAULTED'] } },
      _sum: {
        principalAmount: true,
        totalPaid: true,
        outstandingBalance: true,
        moraAmount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        loan: { organizationId },
        collectedAt: { gte: today, lt: tomorrow },
      },
      _sum: { totalReceived: true },
      _count: true,
    }),

    prisma.paymentSchedule.count({
      where: {
        loan: { organizationId, status: 'ACTIVE' },
        isPaid: false,
        dueDate: { lt: today },
      },
    }),

    prisma.paymentSchedule.findMany({
      where: {
        loan: { organizationId, status: 'ACTIVE' },
        isPaid: false,
        dueDate: { lt: today },
      },
      select: {
        id: true,
        installmentNumber: true,
        dueDate: true,
        amountDue: true,
        amountPaid: true,
        loan: {
          select: {
            id: true,
            client: {
              select: { firstName: true, lastName: true, phone: true },
            },
            collector: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),

    prisma.payment.findMany({
      where: { loan: { organizationId } },
      select: {
        id: true,
        amount: true,
        totalReceived: true,
        collectedAt: true,
        loan: {
          select: {
            client: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        collector: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { collectedAt: 'desc' },
      take: 10,
    }),
  ]);

  const sums = loanAggregates._sum;

  return {
    activeLoans,
    totalClients,
    totalCollectors,
    totalDisbursed: new Decimal(sums.principalAmount || 0).toFixed(2),
    totalCollected: new Decimal(sums.totalPaid || 0).toFixed(2),
    totalOutstanding: new Decimal(sums.outstandingBalance || 0).toFixed(2),
    totalMora: new Decimal(sums.moraAmount || 0).toFixed(2),
    todayCollected: new Decimal(todayPaymentsAgg._sum.totalReceived || 0).toFixed(2),
    todayPayments: todayPaymentsAgg._count,
    overdueSchedules,
    moraAlerts,
    recentPayments,
  };
};

export { getDashboardKPIs };
