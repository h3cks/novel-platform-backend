import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid'; // <-- Додано імпорт uuid
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Пояснюємо TypeScript, що об'єкт Request тепер має властивість id
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

// Базовий словник локалізації помилок
const errorMessages: Record<string, string> = {
  uk: 'Сталася непередбачувана помилка. Будь ласка, спробуйте пізніше.',
  en: 'An unexpected error occurred. Please try again later.',
};

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const lang = req.headers['accept-language']?.includes('uk') ? 'uk' : 'en';

  if (err instanceof AppError) {
    // Логуємо очікувану помилку (наприклад, 400 Bad Request)
    logger.warn(err.message, { reqId: req.id, errorId: err.errorId, context: err.context });

    return res.status(err.statusCode).json({
      status: 'error',
      errorId: err.errorId,
      message: err.message,
      action: 'Перевірте введені дані та повторіть спробу.', // Інструкція для користувача
    });
  }

  // Обробка непередбачуваних помилок (500 Internal Server Error)
  const errorId = uuidv4();
  logger.error('CRITICAL SERVER ERROR', { reqId: req.id, errorId, error: err });

  res.status(500).json({
    status: 'error',
    errorId: errorId,
    message: errorMessages[lang],
    supportHelp: `Якщо проблема повторюється, зверніться до підтримки, вказавши код помилки: ${errorId}`,
  });
};
