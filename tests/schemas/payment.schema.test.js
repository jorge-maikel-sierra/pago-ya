import { describe, it, expect } from '@jest/globals';
import { ZodError } from 'zod';
import {
  registerPaymentSchema,
  batchItemSchema,
  batchSyncSchema,
  SYNC_STATUSES,
} from '../../src/schemas/payment.schema.js';

describe('registerPaymentSchema', () => {
  const validPayload = {
    loanId: '550e8400-e29b-41d4-a716-446655440000',
    amountPaid: 25000,
  };

  it('accepts a valid minimal payload', () => {
    const result = registerPaymentSchema.parse(validPayload);

    expect(result.loanId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.amountPaid).toBe(25000);
  });

  it('defaults syncStatus to SYNCED', () => {
    const result = registerPaymentSchema.parse(validPayload);

    expect(result.syncStatus).toBe('SYNCED');
  });

  it('accepts all optional fields', () => {
    const result = registerPaymentSchema.parse({
      ...validPayload,
      offlineCreatedAt: '2026-02-22T14:30:00.000Z',
      paymentScheduleId: '770e8400-e29b-41d4-a716-446655440000',
      latitude: 11.5449,
      longitude: -72.9072,
      notes: 'Pago parcial',
      deviceId: 'device-abc-123',
      syncStatus: 'PENDING_SYNC',
    });

    expect(result.offlineCreatedAt).toBe('2026-02-22T14:30:00.000Z');
    expect(result.paymentScheduleId).toBe('770e8400-e29b-41d4-a716-446655440000');
    expect(result.latitude).toBe(11.5449);
    expect(result.deviceId).toBe('device-abc-123');
    expect(result.syncStatus).toBe('PENDING_SYNC');
  });

  it('rejects missing loanId', () => {
    expect(() => registerPaymentSchema.parse({ amountPaid: 25000 })).toThrow(ZodError);
  });

  it('rejects invalid loanId (not UUID)', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, loanId: 'bad' })).toThrow(ZodError);
  });

  it('rejects missing amountPaid', () => {
    expect(() => registerPaymentSchema.parse({ loanId: validPayload.loanId })).toThrow(ZodError);
  });

  it('rejects amountPaid <= 0', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, amountPaid: 0 })).toThrow(ZodError);
    expect(() => registerPaymentSchema.parse({ ...validPayload, amountPaid: -100 })).toThrow(
      ZodError,
    );
  });

  it('rejects invalid offlineCreatedAt format', () => {
    expect(() =>
      registerPaymentSchema.parse({ ...validPayload, offlineCreatedAt: 'not-a-date' }),
    ).toThrow(ZodError);
  });

  it('accepts offlineCreatedAt as optional', () => {
    const result = registerPaymentSchema.parse(validPayload);

    expect(result.offlineCreatedAt).toBeUndefined();
  });

  it('rejects invalid paymentScheduleId (not UUID)', () => {
    expect(() =>
      registerPaymentSchema.parse({ ...validPayload, paymentScheduleId: 'bad' }),
    ).toThrow(ZodError);
  });

  it('rejects latitude out of range', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, latitude: 91 })).toThrow(ZodError);
    expect(() => registerPaymentSchema.parse({ ...validPayload, latitude: -91 })).toThrow(ZodError);
  });

  it('rejects longitude out of range', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, longitude: 181 })).toThrow(
      ZodError,
    );
    expect(() => registerPaymentSchema.parse({ ...validPayload, longitude: -181 })).toThrow(
      ZodError,
    );
  });

  it('rejects notes exceeding 500 characters', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, notes: 'x'.repeat(501) })).toThrow(
      ZodError,
    );
  });

  it('rejects deviceId exceeding 100 characters', () => {
    expect(() =>
      registerPaymentSchema.parse({ ...validPayload, deviceId: 'd'.repeat(101) }),
    ).toThrow(ZodError);
  });

  it('rejects invalid syncStatus', () => {
    expect(() => registerPaymentSchema.parse({ ...validPayload, syncStatus: 'UNKNOWN' })).toThrow(
      ZodError,
    );
  });

  it('accepts all valid syncStatus values', () => {
    SYNC_STATUSES.forEach((status) => {
      const result = registerPaymentSchema.parse({ ...validPayload, syncStatus: status });
      expect(result.syncStatus).toBe(status);
    });
  });
});

describe('batchItemSchema', () => {
  const validItem = {
    localId: 'local-001',
    loanId: '550e8400-e29b-41d4-a716-446655440000',
    amountPaid: 25000,
  };

  it('accepts a valid batch item', () => {
    const result = batchItemSchema.parse(validItem);

    expect(result.localId).toBe('local-001');
    expect(result.loanId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects missing localId', () => {
    const { localId, ...rest } = validItem;
    expect(() => batchItemSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects empty localId', () => {
    expect(() => batchItemSchema.parse({ ...validItem, localId: '' })).toThrow(ZodError);
  });

  it('inherits all payment validations', () => {
    expect(() => batchItemSchema.parse({ ...validItem, amountPaid: -1 })).toThrow(ZodError);
  });
});

describe('batchSyncSchema', () => {
  const validItem = {
    localId: 'local-001',
    loanId: '550e8400-e29b-41d4-a716-446655440000',
    amountPaid: 25000,
  };

  it('accepts a valid batch with one item', () => {
    const result = batchSyncSchema.parse({ payments: [validItem] });

    expect(result.payments).toHaveLength(1);
  });

  it('accepts a batch with multiple items', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...validItem,
      localId: `local-${i}`,
    }));
    const result = batchSyncSchema.parse({ payments: items });

    expect(result.payments).toHaveLength(5);
  });

  it('rejects an empty payments array', () => {
    expect(() => batchSyncSchema.parse({ payments: [] })).toThrow(ZodError);
  });

  it('rejects more than 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...validItem,
      localId: `local-${i}`,
    }));
    expect(() => batchSyncSchema.parse({ payments: items })).toThrow(ZodError);
  });

  it('rejects missing payments key', () => {
    expect(() => batchSyncSchema.parse({})).toThrow(ZodError);
  });
});
