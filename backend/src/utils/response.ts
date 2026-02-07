import { Response } from 'express';

export function ok(res: Response, data: any = null, meta?: any, status = 200) {
  const payload: any = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

export function fail(res: Response, status = 400, code = 'ERROR', message = 'Error', details?: any) {
  const payload: any = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) payload.error.details = details;
  return res.status(status).json(payload);
}
