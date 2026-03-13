import { Queue } from 'bullmq';
import dayjs from 'dayjs';
import asyncHandler from '../utils/asyncHandler.js';
import redisClient from '../config/redis.js';
import { generateDailyPortfolioExcel } from '../services/excel.service.js';

const PDF_QUEUE_NAME = 'pdf-generation';

/**
 * Cola BullMQ para generación de PDFs en segundo plano.
 * Se crea con lazy connection para no bloquear el import.
 */
const pdfQueue = new Queue(PDF_QUEUE_NAME, {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

/**
 * GET /admin/reports/export/:format
 *
 * Genera un reporte de cartera y lo entrega según el formato:
 * - **xlsx**: genera síncronamente y envía como descarga directa.
 * - **pdf**: encola un job en BullMQ para procesamiento en segundo plano.
 * - Otro formato: lanza error 400.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @throws {Error} statusCode 400 para formatos no soportados
 */
const exportReport = asyncHandler(async (req, res) => {
  const { format } = req.params;
  const { organizationId } = req.user;
  const reportDate = dayjs().format('YYYY-MM-DD');

  if (format === 'xlsx') {
    const { default: prisma } = await import('../config/prisma.js');

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const schedules = await prisma.paymentSchedule.findMany({
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
            collector: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { loan: { client: { lastName: 'asc' } } },
    });

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

    const buffer = await generateDailyPortfolioExcel({
      organizationName: organization?.name || 'Paga Diario',
      reportDate,
      rows,
    });

    const filename = `cartera-${reportDate}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return res.send(buffer);
  }

  if (format === 'pdf') {
    const jobId = `pdf-${organizationId}-${reportDate}`;

    await pdfQueue.add(
      'generate-portfolio-pdf',
      {
        organizationId,
        reportDate,
        requestedBy: req.user.id,
      },
      { jobId },
    );

    req.session.flashSucess =
      'El PDF se está generando en segundo plano. Estará disponible en unos momentos.';
    return res.redirect('/admin/reports');
  }

  const err = new Error(`Formato de reporte no soportado: ${format}`);
  err.statusCode = 400;
  throw err;
});

export { exportReport, pdfQueue, PDF_QUEUE_NAME };
