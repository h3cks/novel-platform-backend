// src/middlewares/requestLogger.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id']?.toString() || uuidv4();
  logger.http(`Incoming request: ${req.method} ${req.url}`, { reqId: req.id });
  next();
};
