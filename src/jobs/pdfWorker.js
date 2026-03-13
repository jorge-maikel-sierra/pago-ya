import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';
import { generateLoanPDF } from '../services/pdf.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QUEUE_NAME = 'pdf-generation';
const UPLOADS_DIR = join(__dirname, '..', '..', 'uploads');

/**
 * Consulta Prisma para obtener los datos completos de un préstamo
 * incluyendo cliente, cobrador y cronograma de pagos.
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<Array>} Lista de préstamos activos con schedule
 */
const fetchLoansWithSchedule = async (organizationId) => {
  const { default: prisma } = await import('../config/prisma.js');

  return prisma.loan.findMany({
    where: { organizationId, status: 'ACTIVE' },
    select: {
      id: true,
      principalAmount: true,
      interestRate: true,
      totalAmount: true,
      totalPaid: true,
      outstandingBalance: true,
      moraAmount: true,
      numberOfPayments: true,
      paidPayments: true,
      disbursementDate: true,
      expectedEndDate: true,
      status: true,
      paymentFrequency: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          documentNumber: true,
        },
      },
      collector: {
        select: { firstName: true, lastName: true },
      },
      paymentSchedule: {
        select: {
          installmentNumber: true,
          dueDate: true,
          amountDue: true,
          principalDue: true,
          interestDue: true,
          amountPaid: true,
          isPaid: true,
        },
        orderBy: { installmentNumber: 'asc' },
      },
    },
    orderBy: { client: { lastName: 'asc' } },
  });
};

/**
 * Transforma un préstamo Prisma al formato esperado por generateLoanPDF.
 *
 * @param {object} loan - Préstamo con relaciones de Prisma
 * @returns {object} Objeto con loanSummary y schedule
 */
const transformLoanForPDF = (loan) => {
  const loanSummary = {
    clientName: `${loan.client.firstName} ${loan.client.lastName}`,
    documentNumber: loan.client.documentNumber,
    collectorName: `${loan.collector.firstName} ${loan.collector.lastName}`,
    principalAmount: loan.principalAmount.toString(),
    interestRate: loan.interestRate.toString(),
    totalAmount: loan.totalAmount.toString(),
    totalPaid: loan.totalPaid.toString(),
    outstandingBalance: loan.outstandingBalance.toString(),
    moraAmount: loan.moraAmount.toString(),
    numberOfPayments: loan.numberOfPayments,
    paidPayments: loan.paidPayments,
    disbursementDate: loan.disbursementDate.toISOString().split('T')[0],
    expectedEndDate: loan.expectedEndDate.toISOString().split('T')[0],
    status: loan.status,
    paymentFrequency: loan.paymentFrequency,
  };

  const schedule = loan.paymentSchedule.map((s) => ({
    installmentNumber: s.installmentNumber,
    dueDate: s.dueDate.toISOString().split('T')[0],
    amountDue: s.amountDue.toString(),
    principalDue: s.principalDue.toString(),
    interestDue: s.interestDue.toString(),
    amountPaid: s.amountPaid.toString(),
    isPaid: s.isPaid,
  }));

  return { loanSummary, schedule };
};

/**
 * Inicia el worker de BullMQ que genera PDFs de reportes en segundo plano.
 *
 * Cola: pdf-generation
 * - Concurrencia: 2 (PDFs son CPU-intensivos)
 * - Reintentos: 3 con backoff exponencial (2s base)
 * - Guarda archivos en la carpeta uploads/
 *
 * @returns {Worker} Instancia del worker
 */
const startPdfWorker = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { organizationId, reportDate } = job.data;

      await mkdir(UPLOADS_DIR, { recursive: true });

      const loans = await fetchLoansWithSchedule(organizationId);

      if (loans.length === 0) {
        return { status: 'empty', message: 'No hay préstamos activos para generar PDF' };
      }

      const firstLoan = loans[0];
      const { loanSummary, schedule } = transformLoanForPDF(firstLoan);

      const pdfBuffer = await generateLoanPDF(loanSummary, schedule);

      const filename = `reporte-${organizationId.slice(0, 8)}-${reportDate}.pdf`;
      const filePath = join(UPLOADS_DIR, filename);
      await writeFile(filePath, pdfBuffer);

      return {
        status: 'completed',
        filename,
        filePath,
        loansProcessed: loans.length,
        size: pdfBuffer.length,
      };
    },
    {
      connection: redisClient,
      concurrency: 2,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    },
  );

  worker.on('completed', (job, result) => {
    console.log(`[PdfWorker] Job ${job.id} completado: ${result.filename || result.message}`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[PdfWorker] Job ${job?.id} falló (intento ${job?.attemptsMade}/${job?.opts?.attempts}):`,
      err.message,
    );
  });

  console.log(`[PdfWorker] Escuchando cola "${QUEUE_NAME}"`);
  return worker;
};

export default startPdfWorker;
export { QUEUE_NAME, UPLOADS_DIR, fetchLoansWithSchedule, transformLoanForPDF };
