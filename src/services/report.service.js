import prisma from '../config/prisma.js';

/**
 * Obtiene la cartera (cronograma de cuotas con detalle de préstamo)
 * filtrada por rango de fechas y ruta opcional, para el panel de reportes.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ dateFrom?: string, dateTo?: string, routeId?: string }} [filters]
 * @returns {Promise<{ portfolio: Array, routes: Array }>}
 */
export const getPortfolioReport = async (organizationId, { dateFrom, dateTo, routeId } = {}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filterDateFrom = dateFrom ? new Date(dateFrom) : today;
  const filterDateTo = dateTo ? new Date(dateTo) : new Date(today);
  filterDateTo.setHours(23, 59, 59, 999);

  const [portfolio, routes] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: {
        dueDate: { gte: filterDateFrom, lte: filterDateTo },
        loan: {
          organizationId,
          status: { in: ['ACTIVE', 'PENDING', 'DEFAULTED'] },
          ...(routeId && {
            collector: { routes: { some: { id: routeId } } },
          }),
        },
      },
      select: {
        id: true,
        dueDate: true,
        amountDue: true,
        amountPaid: true,
        loan: {
          select: {
            id: true,
            status: true,
            outstandingBalance: true,
            moraAmount: true,
            client: { select: { firstName: true, lastName: true, phone: true } },
            collector: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { loan: { client: { lastName: 'asc' } } },
      take: 200,
    }),
    prisma.route.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return { portfolio, routes };
};

/**
 * Obtiene los datos del reporte diario para exportación a Excel/PDF.
 * Retorna el nombre de la organización y las cuotas del día con detalle completo.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {string} reportDate - Fecha en formato YYYY-MM-DD
 * @returns {Promise<{ organizationName: string, reportDate: string, rows: Array }>}
 */
export const getDailyExportData = async (organizationId, reportDate) => {
  const [organization, schedules] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.paymentSchedule.findMany({
      where: {
        dueDate: { equals: new Date(reportDate) },
        loan: { organizationId },
      },
      select: {
        installmentNumber: true,
        amountDue: true,
        loan: {
          select: {
            id: true,
            status: true,
            outstandingBalance: true,
            moraAmount: true,
            client: {
              select: {
                firstName: true,
                lastName: true,
                documentNumber: true,
                phone: true,
                address: true,
              },
            },
            collector: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { loan: { client: { lastName: 'asc' } } },
    }),
  ]);

  const rows = schedules.map((s) => ({
    clientName: `${s.loan.client.firstName} ${s.loan.client.lastName}`,
    documentNumber: s.loan.client.documentNumber,
    phone: s.loan.client.phone || '',
    address: s.loan.client.address || '',
    loanId: s.loan.id,
    status: s.loan.status,
    installmentNumber: s.installmentNumber,
    amountDue: s.amountDue.toString(),
    outstandingBalance: s.loan.outstandingBalance.toString(),
    moraAmount: s.loan.moraAmount.toString(),
    collectorName: `${s.loan.collector.firstName} ${s.loan.collector.lastName}`,
    routeName: '',
  }));

  return {
    organizationName: organization?.name || 'Paga Diario',
    reportDate,
    rows,
  };
};

/**
 * Obtiene los pagos de una organización con filtros y paginación.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ dateFrom?: string, dateTo?: string, collectorId?: string,
 *   paymentMethod?: string, page?: number, pageSize?: number }} [filters]
 * @returns {Promise<{ payments: Array, collectors: Array, total: number,
 *   page: number, totalPages: number }>}
 */
export const findPayments = async (
  organizationId,
  { dateFrom, dateTo, collectorId, paymentMethod, page = 1, pageSize = 25 } = {},
) => {
  const currentPage = Math.max(1, page);
  const skip = (currentPage - 1) * pageSize;

  /** @type {import('@prisma/client').Prisma.DateTimeFilter|undefined} */
  let collectedAtFilter;
  if (dateFrom || dateTo) {
    collectedAtFilter = {};
    if (dateFrom) collectedAtFilter.gte = new Date(dateFrom);
    if (dateTo) collectedAtFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  /** @type {import('@prisma/client').Prisma.PaymentWhereInput} */
  const where = {
    loan: { organizationId },
    ...(collectedAtFilter && { collectedAt: collectedAtFilter }),
    ...(collectorId && { collectorId }),
    ...(paymentMethod && { paymentMethod }),
  };

  const [payments, total, collectors] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { collectedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        amount: true,
        principalApplied: true,
        interestApplied: true,
        moraAmount: true,
        totalReceived: true,
        paymentType: true,
        paymentMethod: true,
        telegramSent: true,
        notes: true,
        collectedAt: true,
        loan: {
          select: {
            id: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
        collector: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.user.findMany({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);

  return {
    payments,
    collectors,
    total,
    page: currentPage,
    totalPages: Math.ceil(total / pageSize),
  };
};
