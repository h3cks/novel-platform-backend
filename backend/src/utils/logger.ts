import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, reqId, userId }) => {
    const reqContext = reqId ? `[ReqID: ${reqId}]` : '';
    const userContext = userId ? `[UserID: ${userId}]` : '';
    return `${timestamp} [${level.toUpperCase()}] ${reqContext} ${userContext}: ${message} ${stack ? `\n${stack}` : ''}`;
  }),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // 65% - Конфігурація без перекомпіляції
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
  ],
});

logger.add(
  new DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m', // Ротація за розміром: новий файл, якщо поточний > 20 МБ
    maxFiles: '14d', // Ротація за часом: зберігати логи лише за останні 14 днів
  }),
);

logger.add(
  new DailyRotateFile({
    filename: 'logs/combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
  }),
);