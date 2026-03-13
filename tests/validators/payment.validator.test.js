import { describe, it, expect } from '@jest/globals';
import { registerPaymentSchema, batchSyncSchema } from '../../src/validators/payment.validator.js';

describe('registerPaymentSchema', () => {
  const validPayload = {
    loanId: '550e8400-e29b-41d4-a716-446655440000',
    amountPaid: 50000,
    offlineCreatedAt: '2026-02-22T14:30:00.000Z',
  };

  it('acepta un payload válido mínimo', () => {
    const result = registerPaymentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validPayload);
  });

  it('acepta un payload con todos los campos opcionales', () => {
    const full = {
      ...validPayload,
      paymentScheduleId: '660e8400-e29b-41d4-a716-446655440000',
      latitude: 4.6097102,
      longitude: -74.08175,
      notes: 'Pago parcial',
    };
    const result = registerPaymentSchema.safeParse(full);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(full);
  });

  it('rechaza si falta loanId', () => {
    const { loanId, ...payload } = validPayload;
    const result = registerPaymentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('loanId');
  });

  it('rechaza si falta amountPaid', () => {
    const { amountPaid, ...payload } = validPayload;
    const result = registerPaymentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('amountPaid');
  });

  it('rechaza si falta offlineCreatedAt', () => {
    const { offlineCreatedAt, ...payload } = validPayload;
    const result = registerPaymentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('offlineCreatedAt');
  });

  it('rechaza loanId que no sea UUID', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, loanId: 'no-uuid' });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/UUID/);
  });

  it('rechaza amountPaid negativo', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, amountPaid: -100 });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('amountPaid');
  });

  it('rechaza amountPaid cero', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, amountPaid: 0 });
    expect(result.success).toBe(false);
  });

  it('rechaza offlineCreatedAt con formato inválido', () => {
    const result = registerPaymentSchema.safeParse({
      ...validPayload,
      offlineCreatedAt: '22-02-2026',
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/ISO 8601/);
  });

  it('rechaza paymentScheduleId que no sea UUID', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, paymentScheduleId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/UUID/);
  });

  it('rechaza latitude fuera de rango', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, latitude: 91 });
    expect(result.success).toBe(false);
  });

  it('rechaza longitude fuera de rango', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, longitude: -181 });
    expect(result.success).toBe(false);
  });

  it('rechaza notes con más de 500 caracteres', () => {
    const result = registerPaymentSchema.safeParse({ ...validPayload, notes: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('batchSyncSchema', () => {
  const validItem = {
    localId: 'local-001',
    loanId: '550e8400-e29b-41d4-a716-446655440000',
    amountPaid: 50000,
    offlineCreatedAt: '2026-02-22T14:30:00.000Z',
  };

  it('acepta un array con un solo item válido', () => {
    const result = batchSyncSchema.safeParse({ payments: [validItem] });
    expect(result.success).toBe(true);
    expect(result.data.payments).toHaveLength(1);
  });

  it('acepta un array con múltiples items', () => {
    const result = batchSyncSchema.safeParse({
      payments: [validItem, { ...validItem, localId: 'local-002', amountPaid: 30000 }],
    });
    expect(result.success).toBe(true);
    expect(result.data.payments).toHaveLength(2);
  });

  it('rechaza un array vacío', () => {
    const result = batchSyncSchema.safeParse({ payments: [] });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/al menos un pago/);
  });

  it('rechaza más de 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...validItem,
      localId: `local-${i}`,
    }));
    const result = batchSyncSchema.safeParse({ payments: items });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/50/);
  });

  it('rechaza si falta payments', () => {
    const result = batchSyncSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rechaza si localId está vacío', () => {
    const result = batchSyncSchema.safeParse({
      payments: [{ ...validItem, localId: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza si falta localId', () => {
    const { localId, ...item } = validItem;
    const result = batchSyncSchema.safeParse({ payments: [item] });
    expect(result.success).toBe(false);
  });

  it('acepta items con campos opcionales', () => {
    const result = batchSyncSchema.safeParse({
      payments: [
        {
          ...validItem,
          paymentScheduleId: '660e8400-e29b-41d4-a716-446655440000',
          latitude: 4.6097102,
          longitude: -74.08175,
          notes: 'Notas',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
