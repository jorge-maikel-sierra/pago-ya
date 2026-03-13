import { describe, it, expect } from '@jest/globals';
import { ZodError } from 'zod';
import {
  createClientSchema,
  updateClientSchema,
  DOCUMENT_TYPES,
} from '../../src/schemas/client.schema.js';

describe('createClientSchema', () => {
  const validPayload = {
    firstName: 'Juan',
    lastName: 'Pérez',
    documentNumber: '1234567890',
    address: 'Calle 10 #5-20',
  };

  it('accepts a valid minimal payload', () => {
    const result = createClientSchema.parse(validPayload);

    expect(result.firstName).toBe('Juan');
    expect(result.lastName).toBe('Pérez');
    expect(result.documentNumber).toBe('1234567890');
    expect(result.address).toBe('Calle 10 #5-20');
  });

  it('defaults documentType to CC', () => {
    const result = createClientSchema.parse(validPayload);

    expect(result.documentType).toBe('CC');
  });

  it('defaults city to Riohacha', () => {
    const result = createClientSchema.parse(validPayload);

    expect(result.city).toBe('Riohacha');
  });

  it('accepts all optional fields', () => {
    const result = createClientSchema.parse({
      ...validPayload,
      documentType: 'CE',
      phone: '3001234567',
      city: 'Bogotá',
      businessName: 'Tienda Pérez',
      businessAddress: 'Calle 5 #2-10',
      latitude: 11.5449,
      longitude: -72.9072,
      notes: 'Cliente preferencial',
      routeId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.documentType).toBe('CE');
    expect(result.phone).toBe('3001234567');
    expect(result.city).toBe('Bogotá');
    expect(result.businessName).toBe('Tienda Pérez');
    expect(result.latitude).toBe(11.5449);
    expect(result.longitude).toBe(-72.9072);
    expect(result.routeId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('trims string fields', () => {
    const result = createClientSchema.parse({
      ...validPayload,
      firstName: '  Juan  ',
      lastName: '  Pérez  ',
      documentNumber: '  1234567890  ',
      address: '  Calle 10  ',
    });

    expect(result.firstName).toBe('Juan');
    expect(result.lastName).toBe('Pérez');
    expect(result.documentNumber).toBe('1234567890');
    expect(result.address).toBe('Calle 10');
  });

  it('rejects missing firstName', () => {
    const { firstName, ...rest } = validPayload;
    expect(() => createClientSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects missing lastName', () => {
    const { lastName, ...rest } = validPayload;
    expect(() => createClientSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects missing documentNumber', () => {
    const { documentNumber, ...rest } = validPayload;
    expect(() => createClientSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects missing address', () => {
    const { address, ...rest } = validPayload;
    expect(() => createClientSchema.parse(rest)).toThrow(ZodError);
  });

  it('rejects empty firstName', () => {
    expect(() => createClientSchema.parse({ ...validPayload, firstName: '' })).toThrow(ZodError);
  });

  it('rejects firstName exceeding 80 characters', () => {
    expect(() => createClientSchema.parse({ ...validPayload, firstName: 'a'.repeat(81) })).toThrow(
      ZodError,
    );
  });

  it('rejects documentNumber exceeding 30 characters', () => {
    expect(() =>
      createClientSchema.parse({ ...validPayload, documentNumber: '1'.repeat(31) }),
    ).toThrow(ZodError);
  });

  it('rejects invalid documentType', () => {
    expect(() => createClientSchema.parse({ ...validPayload, documentType: 'INVALID' })).toThrow(
      ZodError,
    );
  });

  it('accepts all valid document types', () => {
    DOCUMENT_TYPES.forEach((type) => {
      const result = createClientSchema.parse({ ...validPayload, documentType: type });
      expect(result.documentType).toBe(type);
    });
  });

  it('rejects latitude below -90', () => {
    expect(() => createClientSchema.parse({ ...validPayload, latitude: -91 })).toThrow(ZodError);
  });

  it('rejects latitude above 90', () => {
    expect(() => createClientSchema.parse({ ...validPayload, latitude: 91 })).toThrow(ZodError);
  });

  it('rejects longitude below -180', () => {
    expect(() => createClientSchema.parse({ ...validPayload, longitude: -181 })).toThrow(ZodError);
  });

  it('rejects longitude above 180', () => {
    expect(() => createClientSchema.parse({ ...validPayload, longitude: 181 })).toThrow(ZodError);
  });

  it('accepts boundary GPS values', () => {
    const result = createClientSchema.parse({
      ...validPayload,
      latitude: -90,
      longitude: 180,
    });

    expect(result.latitude).toBe(-90);
    expect(result.longitude).toBe(180);
  });

  it('rejects phone exceeding 20 characters', () => {
    expect(() => createClientSchema.parse({ ...validPayload, phone: '3'.repeat(21) })).toThrow(
      ZodError,
    );
  });

  it('rejects notes exceeding 1000 characters', () => {
    expect(() => createClientSchema.parse({ ...validPayload, notes: 'x'.repeat(1001) })).toThrow(
      ZodError,
    );
  });

  it('rejects invalid routeId (not UUID)', () => {
    expect(() => createClientSchema.parse({ ...validPayload, routeId: 'not-uuid' })).toThrow(
      ZodError,
    );
  });
});

describe('updateClientSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = updateClientSchema.parse({});

    expect(result).toEqual({});
  });

  it('accepts a partial update with only firstName', () => {
    const result = updateClientSchema.parse({ firstName: 'Carlos' });

    expect(result.firstName).toBe('Carlos');
    expect(result.lastName).toBeUndefined();
  });

  it('validates fields that are provided', () => {
    expect(() => updateClientSchema.parse({ firstName: '' })).toThrow(ZodError);
  });

  it('validates GPS coordinates when provided', () => {
    expect(() => updateClientSchema.parse({ latitude: 200 })).toThrow(ZodError);
  });
});
