import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSetWebHook = jest.fn();
const mockSendMessage = jest.fn();
const mockOnText = jest.fn();
const mockOn = jest.fn();

jest.unstable_mockModule('node-telegram-bot-api', () => ({
  default: jest.fn().mockImplementation(() => ({
    setWebHook: mockSetWebHook,
    sendMessage: mockSendMessage,
    onText: mockOnText,
    on: mockOn,
  })),
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    loan: { findFirst: jest.fn() },
  },
}));

const { initTelegramBot, getBot } = await import('../../src/config/telegram.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initTelegramBot', () => {
  it('returns undefined when token is empty', () => {
    const result = initTelegramBot({ token: '' });
    expect(result).toBeUndefined();
  });

  it('returns undefined when token is not provided', () => {
    const result = initTelegramBot({ token: undefined });
    expect(result).toBeUndefined();
  });

  it('initializes in polling mode for development', () => {
    const bot = initTelegramBot({ token: 'test-token', isProduction: false });

    expect(bot).toBeDefined();
    expect(mockSetWebHook).not.toHaveBeenCalled();
    expect(mockOnText).toHaveBeenCalledTimes(2);
  });

  it('initializes in webhook mode for production', () => {
    const bot = initTelegramBot({
      token: 'test-token',
      webhookUrl: 'https://example.com',
      isProduction: true,
    });

    expect(bot).toBeDefined();
    expect(mockSetWebHook).toHaveBeenCalledWith('https://example.com/api/telegram/webhook');
  });

  it('falls back to polling if production but no webhookUrl', () => {
    const bot = initTelegramBot({
      token: 'test-token',
      isProduction: true,
    });

    expect(bot).toBeDefined();
    expect(mockSetWebHook).not.toHaveBeenCalled();
  });

  it('registers /start and /saldo commands', () => {
    initTelegramBot({ token: 'test-token' });

    expect(mockOnText).toHaveBeenCalledWith(/\/start/, expect.any(Function));
    expect(mockOnText).toHaveBeenCalledWith(/\/saldo/, expect.any(Function));
  });

  it('registers polling_error handler', () => {
    initTelegramBot({ token: 'test-token' });

    expect(mockOn).toHaveBeenCalledWith('polling_error', expect.any(Function));
  });
});

describe('getBot', () => {
  it('returns the bot instance after initialization', () => {
    initTelegramBot({ token: 'test-token' });
    const bot = getBot();
    expect(bot).toBeDefined();
  });
});

describe('/start command handler', () => {
  it('sends welcome message with Markdown', () => {
    initTelegramBot({ token: 'test-token' });

    // The first onText call is /start, second is /saldo
    const startHandler = mockOnText.mock.calls[0][1];
    startHandler({ chat: { id: 123 } });

    expect(mockSendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Bienvenido'), {
      parse_mode: 'Markdown',
    });
  });
});

describe('/saldo command handler', () => {
  it('sends loan summary when active loan exists', async () => {
    const { default: prismaMock } = await import('../../src/config/prisma.js');
    prismaMock.loan.findFirst.mockResolvedValue({
      principalAmount: 200000,
      outstandingBalance: 150000,
      paidPayments: 10,
      numberOfPayments: 30,
      client: { firstName: 'María', lastName: 'López' },
    });

    initTelegramBot({ token: 'test-token' });
    const saldoHandler = mockOnText.mock.calls[1][1];
    await saldoHandler({ chat: { id: 456 } });

    expect(mockSendMessage).toHaveBeenCalledWith(456, expect.stringContaining('Resumen de Saldo'), {
      parse_mode: 'Markdown',
    });
  });

  it('sends "no active loans" message when none exist', async () => {
    const { default: prismaMock } = await import('../../src/config/prisma.js');
    prismaMock.loan.findFirst.mockResolvedValue(undefined);

    initTelegramBot({ token: 'test-token' });
    const saldoHandler = mockOnText.mock.calls[1][1];
    await saldoHandler({ chat: { id: 789 } });

    expect(mockSendMessage).toHaveBeenCalledWith(
      789,
      expect.stringContaining('No hay préstamos activos'),
    );
  });

  it('sends error message when database query fails', async () => {
    const { default: prismaMock } = await import('../../src/config/prisma.js');
    prismaMock.loan.findFirst.mockRejectedValue(new Error('DB error'));

    initTelegramBot({ token: 'test-token' });
    const saldoHandler = mockOnText.mock.calls[1][1];
    await saldoHandler({ chat: { id: 111 } });

    expect(mockSendMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining('Error al consultar saldo'),
    );
  });
});

describe('polling_error handler', () => {
  it('logs non-409 polling errors', () => {
    initTelegramBot({ token: 'test-token' });

    const errorHandler = mockOn.mock.calls.find((call) => call[0] === 'polling_error')?.[1];

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler({ code: 'EFATAL', message: 'Network error' });
    expect(consoleSpy).toHaveBeenCalledWith('[Telegram] Polling error:', 'Network error');
    consoleSpy.mockRestore();
  });

  it('ignores 409 conflict polling errors', () => {
    initTelegramBot({ token: 'test-token' });

    const errorHandler = mockOn.mock.calls.find((call) => call[0] === 'polling_error')?.[1];

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler({ code: 'ETELEGRAM', message: 'Conflict: 409' });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
