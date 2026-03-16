import dayjs from 'dayjs';
import asyncHandler from '../utils/asyncHandler.js';
import { generateDailyPortfolioExcel } from '../services/excel.service.js';
import { getDailyExportData } from '../services/report.service.js';
import { enqueuePdfGeneration } from '../services/notification.service.js';

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
    try {
      // Delegar el encolado al service — el controller no instancia colas directamente
      await enqueuePdfGeneration(
        { organizationId, reportDate, requestedBy: req.user.id },
        `pdf-${organizationId}-${reportDate}`,
      );
      req.session.flashSucess =
        'El PDF se está generando en segundo plano. Estará disponible en unos momentos.';
    } catch (err) {
      // enqueuePdfGeneration lanza con statusCode 503 cuando Redis no está disponible
      req.session.flashError = err.message;
    }
    return res.redirect('/admin/reports');
  }

  const err = new Error(`Formato de reporte no soportado: ${format}`);
  err.statusCode = 400;
  throw err;
});

export { exportReport };
