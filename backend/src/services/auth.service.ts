import prisma from '../prisma/client';
import bcrypt from 'bcrypt';
import { sign } from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';

import {
  BCRYPT_SALT_ROUNDS,
  JWT_EXPIRES_IN,
  JWT_SECRET,
  EMAIL_CONFIRM_TOKEN_TTL_HOURS,
  PASSWORD_RESET_TOKEN_TTL_HOURS,
} from '../config';
import { generateToken, hashToken } from '../utils/crypto';
import { sendConfirmationEmail, sendPasswordResetEmail } from './email.service';

/**
 * Безпечне представлення даних користувача без чутливої інформації (наприклад, пароля).
 * @typedef {Object} SafeUser
 */
export type SafeUser = {
  id: number;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: string;
  emailConfirmed: boolean;
  createdAt: Date;
};

/**
 * Фільтрує об'єкт користувача з БД, залишаючи лише безпечні поля.
 * * @param {any} user - Повний об'єкт користувача з бази даних.
 * @returns {SafeUser} Очищений об'єкт користувача.
 */
function safeUser(user: any): SafeUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    emailConfirmed: user.emailConfirmed,
    createdAt: user.createdAt,
  };
}

/**
 * Реєструє нового користувача.
 * Виконує перевірку на унікальність email/username, хешує пароль і генерує токен підтвердження.
 * У разі помилки відправки email — виконує відкат (видаляє створеного користувача).
 * * @async
 * @param {Object} input - Дані для реєстрації.
 * @param {string} [input.username] - Нікнейм користувача.
 * @param {string} [input.email] - Електронна пошта.
 * @param {string} input.password - Пароль у відкритому вигляді.
 * @returns {Promise<SafeUser>} Об'єкт створеного користувача.
 * @throws {Error} EMAIL_TAKEN або USERNAME_TAKEN, якщо дані вже існують.
 * @throws {Error} EMAIL_SEND_FAILED, якщо лист не вдалося надіслати.
 */
export async function registerUser({
                                     username,
                                     email,
                                     password,
                                   }: {
  username?: string | null;
  email?: string | null;
  password: string;
}) {
  // uniqueness checks
  if (email) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      const err: any = new Error('Email already in use');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
  }
  if (username) {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      const err: any = new Error('Username already in use');
      err.code = 'USERNAME_TAKEN';
      throw err;
    }
  }

  const hashed = await bcrypt.hash(password, Number(BCRYPT_SALT_ROUNDS));
  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: hashed,
      // if email is absent, consider account confirmed by design
      emailConfirmed: email ? false : true,
    },
  });

  // generate confirm token (plain for email, hashed for DB)
  if (email) {
    const token = generateToken(32);
    const hashedToken = hashToken(token);
    const expires = new Date(Date.now() + EMAIL_CONFIRM_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmToken: hashedToken,
        emailConfirmExpires: expires,
      },
    });

    try {
      // якщо send падає — ми видалимо створеного користувача щоб не лишати "порожніх" записів
      const { previewUrl } = await sendConfirmationEmail(email, token);
      // optional: повертати previewUrl для локального тестування
      return safeUser(user);
    } catch (err: any) {
      console.error('Failed to send confirmation email, rolling back user creation:', err);
      // видаляємо користувача (бо підтвердження не надіслалось)
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } catch (delErr: any) {
        console.error('Failed to delete user after email send failure:', delErr);
      }
      const e: any = new Error('Failed to send confirmation email');
      e.code = 'EMAIL_SEND_FAILED';
      throw e;
    }
  }

  return safeUser(user);
}

/**
 * Підтверджує електронну пошту користувача за допомогою токена.
 * * @async
 * @param {string} token - Токен підтвердження з email.
 * @returns {Promise<SafeUser>} Оновлений об'єкт користувача.
 * @throws {Error} INVALID_TOKEN, якщо токен не знайдено, або TOKEN_EXPIRED, якщо його час дії минув.
 */
export async function confirmEmail(token: string) {
  const hashed = hashToken(token);
  const user = await prisma.user.findFirst({ where: { emailConfirmToken: hashed, emailConfirmed: false } });
  if (!user) {
    const err: any = new Error('Invalid token');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  if (!user.emailConfirmExpires || user.emailConfirmExpires < new Date()) {
    const err: any = new Error('Token expired');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailConfirmed: true,
      emailConfirmToken: null,
      emailConfirmExpires: null,
    },
  });

  return safeUser(updatedUser);
}

/**
 * Повторно надсилає лист із підтвердженням електронної пошти.
 * * @async
 * @param {string} email - Електронна пошта користувача.
 * @returns {Promise<void>}
 */
export async function resendConfirmation(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // don't reveal
    return;
  }
  if (user.emailConfirmed) {
    return;
  }
  const token = generateToken(32);
  const hashedToken = hashToken(token);
  const expires = new Date(Date.now() + EMAIL_CONFIRM_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailConfirmToken: hashedToken,
      emailConfirmExpires: expires,
    },
  });

  await sendConfirmationEmail(email, token);
}

/**
 * Автентифікує користувача в системі за допомогою email або юзернейма.
 * * @async
 * @param {string} identifier - Email або юзернейм.
 * @param {string} password - Пароль користувача у відкритому вигляді.
 * @returns {Promise<{token: string, user: SafeUser}>} JWT-токен та дані користувача.
 * @throws {Error} INVALID_CREDENTIALS при неправильному логіні чи паролі.
 */
export async function login(identifier: string, password: string) {
  const user =
      (await prisma.user.findUnique({ where: { email: identifier } })) ??
      (await prisma.user.findUnique({ where: { username: identifier } }));

  if (!user) {
    const err: any = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const err: any = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const token = sign(
      { userId: user.id, sub: String(user.id), role: user.role },
      JWT_SECRET as Secret,
      { expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'] }
  );

  return { token, user: safeUser(user) };
}

/**
 * Отримує користувача за його ідентифікатором.
 * * @async
 * @param {number} id - Унікальний ідентифікатор користувача.
 * @returns {Promise<SafeUser | null>} Дані користувача або null, якщо не знайдено.
 */
export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  return safeUser(user);
}

/**
 * Змінює пароль користувача після перевірки поточного пароля.
 * * @async
 * @param {number} userId - Ідентифікатор користувача.
 * @param {string} currentPassword - Поточний пароль.
 * @param {string} newPassword - Новий пароль.
 * @returns {Promise<boolean>} Успішність операції.
 * @throws {Error} USER_NOT_FOUND, якщо користувача не існує.
 * @throws {Error} INVALID_PASSWORD, якщо поточний пароль невірний.
 */
export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err: any = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    const err: any = new Error('Current password is incorrect');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }
  const hashed = await bcrypt.hash(newPassword, Number(BCRYPT_SALT_ROUNDS));
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  return true;
}

/**
 * Створює запит на скидання пароля та надсилає email із токеном.
 * * @async
 * @param {string} email - Електронна пошта користувача.
 * @returns {Promise<void>}
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  const token = generateToken(32);
  const hashedToken = hashToken(token);
  const expires = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    },
  });

  await sendPasswordResetEmail(email, token);
}

/**
 * Скидає пароль користувача за допомогою токена відновлення.
 * * @async
 * @param {string} token - Токен відновлення пароля.
 * @param {string} newPassword - Новий пароль.
 * @returns {Promise<boolean>} Успішність операції.
 * @throws {Error} INVALID_TOKEN або TOKEN_EXPIRED при проблемах з токеном.
 */
export async function resetPassword(token: string, newPassword: string) {
  const hashed = hashToken(token);
  const user = await prisma.user.findFirst({ where: { passwordResetToken: hashed } });
  if (!user) {
    const err: any = new Error('Invalid token');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    const err: any = new Error('Token expired');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  const hashedPassword = await bcrypt.hash(newPassword, Number(BCRYPT_SALT_ROUNDS));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  return true;
}