import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // normalize error
  const status = err.status && Number.isInteger(err.status) ? err.status : (err.code === 'INVALID_CREDENTIALS' ? 401 : 500);
  const code = err.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
  // Hide internals in production
  const message = process.env.NODE_ENV === 'production' && status === 500 ? 'Server error' : (err.message ?? 'Server error');

  const payload: any = {
    success: false,
    error: { code, message },
  };

  if (err.details && process.env.NODE_ENV !== 'production') payload.error.details = err.details;

  // Consider logging structured err here (Sentry/pino/etc)
  console.error('Unhandled error:', err);

  return res.status(status).json(payload);
}
