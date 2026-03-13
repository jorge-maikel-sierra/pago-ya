import PDFDocument from 'pdfkit-table';
import Decimal from 'decimal.js';

/**
 * @typedef {object} LoanSummary
 * @property {string} clientName - Nombre completo del cliente
 * @property {string} documentNumber - Número de documento del cliente
 * @property {string} collectorName - Nombre del cobrador asignado
 * @property {string} principalAmount - Capital prestado (string Decimal)
 * @property {string} interestRate - Tasa de interés diaria (string Decimal)
 * @property {string} totalAmount - Monto total a pagar
 * @property {string} totalPaid - Total pagado hasta la fecha
 * @property {string} outstandingBalance - Saldo pendiente
 * @property {string} moraAmount - Mora acumulada
 * @property {number} numberOfPayments - Número total de cuotas
 * @property {number} paidPayments - Cuotas pagadas
 * @property {string} disbursementDate - Fecha de desembolso (YYYY-MM-DD)
 * @property {string} expectedEndDate - Fecha esperada de fin (YYYY-MM-DD)
 * @property {string} status - Estado del préstamo
 * @property {string} paymentFrequency - Frecuencia de pago
 */

/**
 * @typedef {object} ScheduleRow
 * @property {number} installmentNumber - Número de cuota
 * @property {string} dueDate - Fecha de vencimiento (YYYY-MM-DD)
 * @property {string} amountDue - Monto de la cuota
 * @property {string} principalDue - Porción de capital
 * @property {string} interestDue - Porción de interés
 * @property {string} amountPaid - Monto pagado
 * @property {boolean} isPaid - Si fue pagada
 */

const BRAND_NAVY = '#0A1628';
const BRAND_GREEN = '#00C566';
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SUBTITLE = 12;
const FONT_SIZE_BODY = 9;
const PAGE_MARGIN = 40;

/**
 * Formatea un valor Decimal como moneda colombiana.
 *
 * @param {string|number} value - Valor numérico
 * @returns {string} Valor formateado con separador de miles
 */
const formatCOP = (value) => {
  const dec = new Decimal(value);
  return `$${dec.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Traduce el estado del préstamo al español.
 *
 * @param {string} status - Estado del préstamo en inglés
 * @returns {string} Estado traducido
 */
const translateStatus = (status) => {
  const map = {
    PENDING: 'Pendiente',
    ACTIVE: 'Activo',
    COMPLETED: 'Completado',
    DEFAULTED: 'En mora',
    CANCELLED: 'Cancelado',
  };
  return map[status] || status;
};

/**
 * Traduce la frecuencia de pago al español.
 *
 * @param {string} freq - Frecuencia en inglés
 * @returns {string} Frecuencia traducida
 */
const translateFrequency = (freq) => {
  const map = {
    DAILY: 'Diario',
    WEEKLY: 'Semanal',
    BIWEEKLY: 'Quincenal',
    MONTHLY: 'Mensual',
  };
  return map[freq] || freq;
};

/**
 * Genera un buffer PDF con el resumen del préstamo y su tabla de amortización.
 * Soporta múltiples páginas automáticamente cuando la tabla es extensa.
 *
 * @param {LoanSummary} loan - Datos resumen del préstamo
 * @param {ScheduleRow[]} schedule - Tabla de amortización
 * @returns {Promise<Buffer>} Buffer del PDF generado
 * @throws {Error} Si loan o schedule no son válidos
 */
const generateLoanPDF = (loan, schedule) => {
  if (!loan || typeof loan !== 'object') {
    throw new Error('loan es requerido y debe ser un objeto');
  }
  if (!Array.isArray(schedule)) {
    throw new Error('schedule debe ser un array');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `Préstamo - ${loan.clientName}`,
        Author: 'Paga Diario',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // --- Header ---
    doc
      .fillColor(BRAND_NAVY)
      .fontSize(FONT_SIZE_TITLE)
      .text('Paga Diario', { align: 'center' })
      .moveDown(0.3);

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(FONT_SIZE_SUBTITLE)
      .text('Resumen de Préstamo', { align: 'center' })
      .moveDown(1);

    // --- Loan summary ---
    doc.fillColor(BRAND_NAVY).fontSize(FONT_SIZE_BODY);

    const summaryLines = [
      ['Cliente', loan.clientName],
      ['Documento', loan.documentNumber],
      ['Cobrador', loan.collectorName],
      ['Estado', translateStatus(loan.status)],
      ['Frecuencia', translateFrequency(loan.paymentFrequency)],
      ['Desembolso', loan.disbursementDate],
      ['Fin esperado', loan.expectedEndDate],
      ['Capital', formatCOP(loan.principalAmount)],
      ['Tasa diaria', `${new Decimal(loan.interestRate).mul(100).toFixed(2)}%`],
      ['Monto total', formatCOP(loan.totalAmount)],
      ['Total pagado', formatCOP(loan.totalPaid)],
      ['Saldo pendiente', formatCOP(loan.outstandingBalance)],
      ['Mora acumulada', formatCOP(loan.moraAmount)],
      ['Cuotas', `${loan.paidPayments} / ${loan.numberOfPayments}`],
    ];

    const labelX = PAGE_MARGIN;
    const valueX = PAGE_MARGIN + 140;

    summaryLines.forEach(([label, value]) => {
      doc
        .font('Helvetica-Bold')
        .text(`${label}:`, labelX, doc.y, { continued: true, width: 130 })
        .font('Helvetica')
        .text(`  ${value}`, valueX);
    });

    doc.moveDown(1.5);

    // --- Amortization table ---
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(FONT_SIZE_SUBTITLE)
      .text('Tabla de Amortización', { align: 'center' })
      .moveDown(0.5);

    doc.fillColor(BRAND_NAVY);

    const tableData = {
      headers: [
        {
          label: '#',
          property: 'num',
          width: 30,
          align: 'center',
          headerColor: BRAND_NAVY,
          headerOpacity: 1,
        },
        { label: 'Vencimiento', property: 'date', width: 80, align: 'center' },
        { label: 'Cuota', property: 'amount', width: 80, align: 'right' },
        { label: 'Capital', property: 'principal', width: 80, align: 'right' },
        { label: 'Interés', property: 'interest', width: 80, align: 'right' },
        { label: 'Pagado', property: 'paid', width: 80, align: 'right' },
        { label: 'Estado', property: 'status', width: 60, align: 'center' },
      ],
      datas: schedule.map((row) => ({
        num: String(row.installmentNumber),
        date: row.dueDate,
        amount: formatCOP(row.amountDue),
        principal: formatCOP(row.principalDue),
        interest: formatCOP(row.interestDue),
        paid: formatCOP(row.amountPaid),
        status: row.isPaid ? 'Pagada' : 'Pendiente',
      })),
    };

    const tableOptions = {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(FONT_SIZE_BODY),
      prepareRow: (_row, indexColumn, indexRow) => {
        doc.font('Helvetica').fontSize(FONT_SIZE_BODY);
        if (indexRow % 2 === 0) {
          doc.fillColor('#333333');
        } else {
          doc.fillColor('#555555');
        }
      },
    };

    doc.table(tableData, tableOptions).then(() => {
      // --- Footer with page numbers ---
      const pageCount = doc.bufferedPageRange().count;
      Array.from({ length: pageCount }, (_, i) => i).forEach((i) => {
        doc.switchToPage(i);
        doc
          .fillColor('#999999')
          .fontSize(7)
          .text(
            `Generado por Paga Diario — Página ${i + 1} de ${pageCount}`,
            PAGE_MARGIN,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - PAGE_MARGIN * 2 },
          );
      });

      doc.end();
    });
  });
};

export { generateLoanPDF, formatCOP, translateStatus, translateFrequency };
