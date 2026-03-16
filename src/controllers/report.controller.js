import { Queue } from 'bullmq';
import dayjs from 'dayjs';
import asyncHandler from '../utils/asyncHandler.js';
import redisClient from '../config/redis.js';
import { generateDailyPortfolioExcel } from '../services/excel.service.js';
import { getDailyExportData } from '../services/report.service.js';

const PDF_QUEUE_NAME = 'pdf-generation';

/**
 * Cola BullMQ para generación de PDFs en segundo plano.
 * Solo se crea cuando Redis está disponible — en plan gratuito es null.
 */
const pdfQueue = redisClient
  ? new Queue(PDF_QUEUE_NAME, {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    })
  : null;

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
    const portfolioData = await getDailyExportData(organizationId, reportDate);
    const buffer = await generateDailyPortfolioExcel(portfolioData);

    const filename = `cartera-${reportDate}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return res.send(buffer);
  }

  if (format === 'pdf') {
    if (!pdfQueue) {
      req.session.flashError = 'La generación de PDF no está disponible (Redis requerido).';
      return res.redirect('/admin/reports');
    }

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
