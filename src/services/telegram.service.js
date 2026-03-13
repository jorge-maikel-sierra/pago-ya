import dayjs from 'dayjs';
import { getBot } from '../config/telegram.js';
import prisma from '../config/prisma.js';

/**
 * @typedef {object} PaymentReceiptData
 * @property {string} paymentId - UUID del pago
 * @property {string} chatId - Chat ID de Telegram del destinatario
 * @property {string} clientName - Nombre completo del cliente
 * @property {string|number} amount - Monto de la cuota pagada
 * @property {string|number} moraAmount - Monto de mora cobrada
 * @property {string|number} totalReceived - Total recibido
 * @property {string|number} outstandingBalance - Saldo pendiente del préstamo
 * @property {number} installmentNumber - Número de cuota pagada
 * @property {number} totalInstallments - Total de cuotas del préstamo
 * @property {string} collectorName - Nombre del cobrador
 * @property {string} [collectedAt] - Fecha/hora de recolección (ISO 8601)
 */

/**
 * @typedef {object} MoraAlertData
 * @property {string} chatId - Chat ID de Telegram del destinatario
 * @property {string} clientName - Nombre completo del cliente
 * @property {string|number} outstandingAmount - Monto vencido
 * @property {string|number} moraAmount - Monto de mora acumulada
 * @property {number} daysOverdue - Días de mora
 * @property {string} dueDate - Fecha de vencimiento original (YYYY-MM-DD)
 * @property {number} installmentNumber - Número de cuota vencida
 */

/**
 * Formatea un número como moneda colombiana.
 * @param {string|number} value
 * @returns {string}
 */
const formatCOP = (value) => `$${Number(value).toLocaleString('es-CO')}`;

/**
 * Envía un comprobante de pago formateado por Telegram y marca el pago
 * como notificado en la base de datos (telegramSent = true).
 *
 * @param {PaymentReceiptData} paymentData
 * @returns {Promise<boolean>} true si se envió exitosamente
 * @throws {Error} Si el bot no está configurado o el envío falla
 */
const sendPaymentReceipt = async (paymentData) => {
  const bot = getBot();
  if (!bot) {
    throw new Error('Bot de Telegram no inicializado');
  }

  const {
    paymentId,
    chatId,
    clientName,
    amount,
    moraAmount,
    totalReceived,
    outstandingBalance,
    installmentNumber,
    totalInstallments,
    collectorName,
    collectedAt,
  } = paymentData;

  const dateStr = collectedAt
    ? dayjs(collectedAt).format('DD/MM/YYYY HH:mm')
    : dayjs().format('DD/MM/YYYY HH:mm');

  const moraLine = Number(moraAmount) > 0 ? `⚠️ Mora: ${formatCOP(moraAmount)}\n` : '';

  const message =
    '✅ *COMPROBANTE DE PAGO*\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    `👤 Cliente: *${clientName}*\n` +
    `📅 Fecha: ${dateStr}\n` +
    `💵 Cuota: ${formatCOP(amount)}\n${
      moraLine
    }💰 Total recibido: *${formatCOP(totalReceived)}*\n` +
    `📊 Cuota: ${installmentNumber}/${totalInstallments}\n` +
    `🏦 Saldo pendiente: ${formatCOP(outstandingBalance)}\n` +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    `🧑‍💼 Cobrador: ${collectorName}\n` +
    '📱 _Paga Diario App_';

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  await prisma.payment.update({
    where: { id: paymentId },
    data: { telegramSent: true },
  });

  return true;
};

/**
 * Envía una alerta de mora por Telegram al chat indicado.
 *
 * @param {MoraAlertData} moraData
 * @returns {Promise<boolean>} true si se envió exitosamente
 * @throws {Error} Si el bot no está configurado o el envío falla
 */
const sendMoraAlert = async (moraData) => {
  const bot = getBot();
  if (!bot) {
    throw new Error('Bot de Telegram no inicializado');
  }

  const {
    chatId,
    clientName,
    outstandingAmount,
    moraAmount,
    daysOverdue,
    dueDate,
    installmentNumber,
  } = moraData;

  const dueDateStr = dayjs(dueDate).format('DD/MM/YYYY');

  const message =
    '🔴 *ALERTA DE MORA*\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    `👤 Cliente: *${clientName}*\n` +
    `📅 Vencimiento: ${dueDateStr}\n` +
    `⏰ Días de mora: *${daysOverdue}*\n` +
    `💵 Cuota #${installmentNumber}: ${formatCOP(outstandingAmount)}\n` +
    `⚠️ Mora acumulada: *${formatCOP(moraAmount)}*\n` +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '⚡ _Se requiere gestión inmediata_\n' +
    '📱 _Paga Diario App_';

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  return true;
};

export { sendPaymentReceipt, sendMoraAlert, formatCOP };
