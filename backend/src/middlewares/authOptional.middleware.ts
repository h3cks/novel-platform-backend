import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import type { Secret } from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import prisma from '../prisma/client';

export async function authOptional(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers['authorization'];
    if (!header) return next();

    const parts = String(header).split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return next();

    const token = parts[1];
    try {
      const payload: any = verify(token, JWT_SECRET as Secret, { algorithms: ['HS256'] });
      const uid = payload.userId ?? payload.sub;
      const subId = Number(uid);
      if (!Number.isInteger(subId) || subId <= 0) return next();

      const user = await prisma.user.findUnique({ where: { id: subId } });
      if (!user) return next();

      // attach safe user
      (req as any).user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailConfirmed: user.emailConfirmed,
        createdAt: user.createdAt,
      };
    } catch (err) {
      // будь-яка помилка валідації токена — трактуємо як unauthenticated
      // не логуємо подробиці тут (можна логувати окремо в dev)
    }
    return next();
  } catch (err) {
    // у випадку несподіваної помилки — не блокувати запит
    return next();
  }
}