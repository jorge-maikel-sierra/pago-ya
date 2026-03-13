import { describe, it, expect } from '@jest/globals';
import { ZodError } from 'zod';
import {
  createLoanSchema,
  updateLoanSchema,
  AMORTIZATION_TYPES,
  PAYMENT_FREQUENCIES,
} from '../../src/schemas/loan.schema.js';

describe('createLoanSchema', () => {
  const validPayload = {
    clientId: '550e8400-e29b-41d4-a716-446655440000',
    principalAmount: 200000,
    interestRate: 0.0033,
    numberOfPayments: 30,
    disbursementDate: '2026-03-01',
  };

  it('accepts a valid minimal payload', () => {
    const result = createLoanSchema.parse(validPayload);

    expect(result.clientId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.numberOfPayments).toBe(30);
    expect(result.disbursementDate).toBe('2026-03-01');
  });

  it('transforms principalAmount to string', () => {
    const result = createLoanSchema.parse(validPayload);

    expect(result.principalAmount).toBe('200000');
    expect(typeof result.principalAmount).toBe('string');
  });

  it('transforms interestRate to string', () => {
    const result = createLoanSchema.parse(validPayload);

    expect(result.interestRate).toBe('0.0033');
    expect(typeof result.interestRate).toBe('string');
  });

  it('defaults paymentFrequency to DAILY', () => {
    const result = createLoanSchema.parse(validPayload);

    expect(result.paymentFrequency).toBe('DAILY');
  });

  it('defaults amortizationType to FIXED', () => {
    const result = createLoanSchema.parse(validPayload);

    expect(result.amortizationType).toBe('FIXED');
  });

  it('accepts all optional fields', () => {
    const result = createLoanSchema.parse({
      ...validPayload,
      collectorId: '660e8400-e29b-41d4-a716-446655440000',
      paymentFrequency: 'WEEKLY',
      amortizationType: 'DECLINING_BALANCE',
      notes: 'Préstamo de prueba',
    });

    expect(result.collectorId).toBe('660e8400-e29b-41d4-a716-446655440000');
    expect(result.paymentFrequency).toBe('WEEKLY');
    expect(result.amortizationType).toBe('DECLINING_BALANCE');
    expect(result.notes).toBe('Préstamo de prueba');
  });

  it('rejects missing clientId', () => {
    const { clientId, ...rest } = validPayload;
    expect(() => createLoanSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects invalid clientId (not UUID)', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, clientId: 'not-uuid' })).toThrow(
      ZodError,
    );
  });

  it('rejects missing principalAmount', () => {
    const { principalAmount, ...rest } = validPayload;
    expect(() => createLoanSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects principalAmount <= 0', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, principalAmount: 0 })).toThrow(ZodError);
    expect(() => createLoanSchema.parse({ ...validPayload, principalAmount: -100 })).toThrow(
      ZodError,
    );
  });

  it('rejects missing interestRate', () => {
    const { interestRate, ...rest } = validPayload;
    expect(() => createLoanSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects interestRate <= 0', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, interestRate: 0 })).toThrow(ZodError);
    expect(() => createLoanSchema.parse({ ...validPayload, interestRate: -0.01 })).toThrow(
      ZodError,
    );
  });

  it('rejects interestRate > 1', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, interestRate: 1.5 })).toThrow(ZodError);
  });

  it('rejects missing numberOfPayments', () => {
    const { numberOfPayments, ...rest } = validPayload;
    expect(() => createLoanSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects numberOfPayments <= 0', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, numberOfPayments: 0 })).toThrow(
      ZodError,
    );
  });

  it('rejects non-integer numberOfPayments', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, numberOfPayments: 15.5 })).toThrow(
      ZodError,
    );
  });

  it('rejects numberOfPayments > 365', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, numberOfPayments: 366 })).toThrow(
      ZodError,
    );
  });

  it('rejects missing disbursementDate', () => {
    const { disbursementDate, ...rest } = validPayload;
    expect(() => createLoanSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects invalid disbursementDate format', () => {
    expect(() =>
      createLoanSchema.parse({ ...validPayload, disbursementDate: '01-03-2026' }),
    ).toThrow(ZodError);
    expect(() =>
      createLoanSchema.parse({ ...validPayload, disbursementDate: 'not-a-date' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid paymentFrequency', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, paymentFrequency: 'YEARLY' })).toThrow(
      ZodError,
    );
  });

  it('accepts all valid paymentFrequency values', () => {
    PAYMENT_FREQUENCIES.forEach((freq) => {
      const result = createLoanSchema.parse({ ...validPayload, paymentFrequency: freq });
      expect(result.paymentFrequency).toBe(freq);
    });
  });

  it('rejects invalid amortizationType', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, amortizationType: 'VARIABLE' })).toThrow(
      ZodError,
    );
  });

  it('accepts all valid amortizationType values', () => {
    AMORTIZATION_TYPES.forEach((type) => {
      const result = createLoanSchema.parse({ ...validPayload, amortizationType: type });
      expect(result.amortizationType).toBe(type);
    });
  });

  it('rejects notes exceeding 1000 characters', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, notes: 'x'.repeat(1001) })).toThrow(
      ZodError,
    );
  });

  it('rejects invalid collectorId (not UUID)', () => {
    expect(() => createLoanSchema.parse({ ...validPayload, collectorId: 'bad' })).toThrow(ZodError);
  });
});

describe('updateLoanSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = updateLoanSchema.parse({});

    expect(result).toEqual({});
  });

  it('omits clientId from update', () => {
    const result = updateLoanSchema.parse({ clientId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(result.clientId).toBeUndefined();
  });

  it('omits principalAmount from update', () => {
    const result = updateLoanSchema.parse({ principalAmount: 300000 });

    expect(result.principalAmount).toBeUndefined();
  });

  it('validates provided fields', () => {
    expect(() => updateLoanSchema.parse({ numberOfPayments: -1 })).toThrow(ZodError);
  });

  it('accepts valid partial update', () => {
    const result = updateLoanSchema.parse({
      paymentFrequency: 'WEEKLY',
      notes: 'Cambio de frecuencia',
    });

    expect(result.paymentFrequency).toBe('WEEKLY');
    expect(result.notes).toBe('Cambio de frecuencia');
  });
});
