import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSendMessage = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../src/config/telegram.js', () => ({
  getBot: jest.fn(),
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    payment: { update: mockUpdate },
  },
}));

const { getBot } = await import('../../src/config/telegram.js');
const { sendPaymentReceipt, sendMoraAlert, formatCOP } = await import(
  '../../src/services/telegram.service.js'
);

const samplePaymentData = {
  paymentId: 'pay-123',
  chatId: '999888777',
  clientName: 'María López',
  amount: '7333.33',
  moraAmount: '0',
  totalReceived: '7333.33',
  outstandingBalance: '192666.67',
  installmentNumber: 1,
  totalInstallments: 30,
  collectorName: 'Carlos Pérez',
  collectedAt: '2026-02-22T14:30:00.000Z',
};

const sampleMoraData = {
  chatId: '999888777',
  clientName: 'María López',
  outstandingAmount: '7333.33',
  moraAmount: '495.00',
  daysOverdue: 10,
  dueDate: '2026-02-10',
  installmentNumber: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// formatCOP
// ============================================

describe('formatCOP', () => {
  it('formats a number as Colombian pesos', () => {
    const result = formatCOP(200000);
    expect(result).toContain('$');
    expect(result).toContain('200');
  });

  it('formats a string number', () => {
    const result = formatCOP('7333.33');
    expect(result).toContain('$');
  });

  it('formats zero', () => {
    expect(formatCOP(0)).toBe('$0');
  });
});

// ============================================
// sendPaymentReceipt
// ============================================

describe('sendPaymentReceipt', () => {
  it('throws when bot is not initialized', async () => {
    getBot.mockReturnValue(undefined);

    await expect(sendPaymentReceipt(samplePaymentData)).rejects.toThrow(
      'Bot de Telegram no inicializado',
    );
  });

  it('sends formatted payment receipt via Telegram', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt(samplePaymentData);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      '999888777',
      expect.stringContaining('COMPROBANTE DE PAGO'),
      { parse_mode: 'Markdown' },
    );
  });

  it('includes client name in the message', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt(samplePaymentData);

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('María López');
  });

  it('includes installment progress in the message', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt(samplePaymentData);

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('1/30');
  });

  it('includes mora line when moraAmount > 0', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt({ ...samplePaymentData, moraAmount: '495.00' });

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('Mora');
  });

  it('excludes mora line when moraAmount is 0', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt(samplePaymentData);

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).not.toContain('⚠️ Mora');
  });

  it('marks payment as telegramSent in database', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    await sendPaymentReceipt(samplePaymentData);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-123' },
      data: { telegramSent: true },
    });
  });

  it('returns true on success', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    const result = await sendPaymentReceipt(samplePaymentData);
    expect(result).toBe(true);
  });

  it('uses current date when collectedAt is not provided', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});

    const { collectedAt, ...dataWithoutDate } = samplePaymentData;
    await sendPaymentReceipt(dataWithoutDate);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// sendMoraAlert
// ============================================

describe('sendMoraAlert', () => {
  it('throws when bot is not initialized', async () => {
    getBot.mockReturnValue(undefined);

    await expect(sendMoraAlert(sampleMoraData)).rejects.toThrow('Bot de Telegram no inicializado');
  });

  it('sends formatted mora alert via Telegram', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});

    await sendMoraAlert(sampleMoraData);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      '999888777',
      expect.stringContaining('ALERTA DE MORA'),
      { parse_mode: 'Markdown' },
    );
  });

  it('includes days overdue in the message', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});

    await sendMoraAlert(sampleMoraData);

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('10');
  });

  it('includes client name and installment number', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});

    await sendMoraAlert(sampleMoraData);

    const sentMessage = mockSendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('María López');
    expect(sentMessage).toContain('#3');
  });

  it('returns true on success', async () => {
    const mockBot = { sendMessage: mockSendMessage };
    getBot.mockReturnValue(mockBot);
    mockSendMessage.mockResolvedValue({});

    const result = await sendMoraAlert(sampleMoraData);
    expect(result).toBe(true);
  });
});
