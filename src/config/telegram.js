import TelegramBot from 'node-telegram-bot-api';
import prisma from './prisma.js';

/**
 * @type {TelegramBot|undefined}
 */
let bot;

/**
 * Registra los comandos básicos del bot.
 *
 * @param {TelegramBot} botInstance
 */
const registerCommands = (botInstance) => {
  botInstance.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    botInstance.sendMessage(
      chatId,
      '👋 *¡Bienvenido a Paga Diario!*\n\n' +
        'Soy tu asistente de notificaciones.\n' +
        'Recibirás comprobantes de pago y alertas de mora.\n\n' +
        'Comandos disponibles:\n' +
        '/saldo — Consultar saldo pendiente',
      { parse_mode: 'Markdown' },
    );
  });

  botInstance.onText(/\/saldo/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const activeLoan = await prisma.loan.findFirst({
        where: { status: 'ACTIVE' },
        select: {
          principalAmount: true,
          outstandingBalance: true,
          paidPayments: true,
          numberOfPayments: true,
          client: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeLoan) {
        botInstance.sendMessage(chatId, '📋 No hay préstamos activos registrados.');
        return;
      }

      const message =
        '💰 *Resumen de Saldo*\n\n' +
        `👤 Cliente: ${activeLoan.client.firstName} ${activeLoan.client.lastName}\n` +
        `💵 Capital: $${Number(activeLoan.principalAmount).toLocaleString('es-CO')}\n` +
        `📊 Saldo pendiente: $${Number(activeLoan.outstandingBalance).toLocaleString('es-CO')}\n` +
        `📅 Cuotas: ${activeLoan.paidPayments}/${activeLoan.numberOfPayments}`;

      botInstance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Telegram] Error en /saldo:', err.message);
      botInstance.sendMessage(chatId, '❌ Error al consultar saldo. Intente más tarde.');
    }
  });

  botInstance.on('polling_error', (err) => {
    if (err.code !== 'ETELEGRAM' || !err.message?.includes('409')) {
      console.error('[Telegram] Polling error:', err.message);
    }
  });
};

/**
 * Inicializa el bot de Telegram.
 * - Modo polling en desarrollo (sin servidor público necesario).
 * - Modo webhook en producción (mejor rendimiento).
 *
 * NO inicia si TELEGRAM_BOT_TOKEN está vacío (permite desarrollo sin bot).
 *
 * @param {object} options
 * @param {string} options.token - Token del bot (BotFather)
 * @param {string} [options.webhookUrl] - URL pública para webhook (solo producción)
 * @param {boolean} [options.isProduction=false] - Indica si es entorno de producción
 * @returns {TelegramBot|undefined} Instancia del bot o undefined si no hay token
 */
const initTelegramBot = ({ token, webhookUrl, isProduction = false }) => {
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado. Bot deshabilitado.');
    return undefined;
  }

  if (isProduction && webhookUrl) {
    bot = new TelegramBot(token, { webHook: { port: false } });
    bot.setWebHook(`${webhookUrl}/api/telegram/webhook`);
    console.log(`[Telegram] Bot iniciado en modo webhook: ${webhookUrl}/api/telegram/webhook`);
  } else {
    bot = new TelegramBot(token, { polling: true });
    console.log('[Telegram] Bot iniciado en modo polling (desarrollo)');
  }

  registerCommands(bot);

  return bot;
};

/**
 * Retorna la instancia actual del bot.
 * @returns {TelegramBot|undefined}
 */
const getBot = () => bot;

export { initTelegramBot, getBot, registerCommands };
