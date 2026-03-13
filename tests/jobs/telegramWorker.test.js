import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSendPaymentReceipt = jest.fn();
const mockSendMoraAlert = jest.fn();

jest.unstable_mockModule('../../src/services/telegram.service.js', () => ({
  sendPaymentReceipt: mockSendPaymentReceipt,
  sendMoraAlert: mockSendMoraAlert,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: {},
}));

const mockWorkerInstance = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

let workerProcessor;

jest.unstable_mockModule('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, processor) => {
    workerProcessor = processor;
    return mockWorkerInstance;
  }),
}));

const { default: startTelegramWorker, QUEUE_NAME } = await import(
  '../../src/jobs/telegramWorker.js'
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('telegramWorker', () => {
  describe('configuration', () => {
    it('exports the correct queue name', () => {
      expect(QUEUE_NAME).toBe('telegram-receipts');
    });

    it('creates a worker and registers event handlers', () => {
      const worker = startTelegramWorker();

      expect(worker).toBeDefined();
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });
  });

  describe('event handlers', () => {
    it('logs completed jobs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      startTelegramWorker();

      const completedHandler = mockWorkerInstance.on.mock.calls.find(
        (call) => call[0] === 'completed',
      )[1];
      completedHandler({ id: 'job-1', data: { type: 'payment-receipt' } });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('job-1'));
      consoleSpy.mockRestore();
    });

    it('logs failed jobs', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      startTelegramWorker();

      const failedHandler = mockWorkerInstance.on.mock.calls.find(
        (call) => call[0] === 'failed',
      )[1];
      failedHandler(
        {
          id: 'job-2',
          data: { type: 'mora-alert' },
          attemptsMade: 1,
          opts: { attempts: 3 },
        },
        new Error('Send failed'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('job-2'), 'Send failed');
      consoleSpy.mockRestore();
    });
  });

  describe('job processing', () => {
    it('calls sendPaymentReceipt for payment-receipt jobs', async () => {
      startTelegramWorker();
      mockSendPaymentReceipt.mockResolvedValue(true);

      const jobData = {
        type: 'payment-receipt',
        data: { paymentId: 'pay-1', chatId: '123', clientName: 'Test' },
      };

      await workerProcessor({ data: jobData });

      expect(mockSendPaymentReceipt).toHaveBeenCalledWith(jobData.data);
      expect(mockSendMoraAlert).not.toHaveBeenCalled();
    });

    it('calls sendMoraAlert for mora-alert jobs', async () => {
      startTelegramWorker();
      mockSendMoraAlert.mockResolvedValue(true);

      const jobData = {
        type: 'mora-alert',
        data: { chatId: '123', clientName: 'Test', daysOverdue: 5 },
      };

      await workerProcessor({ data: jobData });

      expect(mockSendMoraAlert).toHaveBeenCalledWith(jobData.data);
      expect(mockSendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('throws for unknown job types', async () => {
      startTelegramWorker();

      const jobData = {
        type: 'unknown-type',
        data: {},
      };

      await expect(workerProcessor({ data: jobData })).rejects.toThrow(
        'Tipo de job desconocido: unknown-type',
      );
    });
  });
});
