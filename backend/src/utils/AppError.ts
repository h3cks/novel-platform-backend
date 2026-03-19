import { v4 as uuidv4 } from 'uuid';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorId: string;
  public readonly context: any;

  constructor(message: string, statusCode: number, context: any = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errorId = uuidv4();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}
