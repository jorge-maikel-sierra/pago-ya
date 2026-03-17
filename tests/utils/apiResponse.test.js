import { describe, it, expect, jest } from '@jest/globals';
import * as apiResponse from '../../src/utils/apiResponse.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('apiResponse helpers', () => {
  it('success usa status 200 por defecto y envuelve data', () => {
    const res = createRes();
    apiResponse.success(res, { ok: true });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true }, meta: null, error: null });
  });

  it('error responde con código y detalles', () => {
    const res = createRes();
    apiResponse.error(res, 'Fallo', 400, [{ field: 'email' }], 'BAD_REQUEST');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: { message: 'Fallo', code: 'BAD_REQUEST', details: [{ field: 'email' }] } }),
    );
  });
});
