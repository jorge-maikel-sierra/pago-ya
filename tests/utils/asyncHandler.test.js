import { describe, it, expect, jest } from '@jest/globals';
import asyncHandler from '../../src/utils/asyncHandler.js';

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('asyncHandler', () => {
  it('llama next con el error si la promesa rechaza', async () => {
    const err = new Error('boom');
    const next = jest.fn();
    const handler = asyncHandler(async () => {
      throw err;
    });

    await handler({}, createRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('propaga respuesta cuando la promesa resuelve', async () => {
    const next = jest.fn();
    const res = createRes();
    res.json.mockReturnValue({ ok: true });

    const handler = asyncHandler(async (_req, resObj) => resObj.json({ ok: true }));

    await handler({}, res, next);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
