import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { isEmail, isPasswordValid, isUsernameValid } from '../utils/validators';
import { ok, fail } from '../utils/response';
import { asyncHandler } from '../middlewares/asyncHandler';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!password || !isPasswordValid(password)) {
    return fail(res, 400, 'INVALID_PASSWORD', 'Password must be at least 8 chars, include uppercase, lowercase, digit, special char');
  }

  if (email && !isEmail(email)) {
    return fail(res, 400, 'INVALID_EMAIL', 'Invalid email format');
  }

  if (username && !isUsernameValid(username)) {
    return fail(res, 400, 'INVALID_USERNAME', 'Username must be 3-30 chars, letters, digits, underscores only');
  }

  if (!email && !username) {
    return fail(res, 400, 'MISSING_IDENTIFIER', 'Either email or username is required');
  }

  try {
    const user = await authService.registerUser({ username, email, password });
    return ok(res, { user }, undefined, 201);
  } catch (err: any) {
    if (err.code === 'EMAIL_TAKEN' || err.code === 'USERNAME_TAKEN') {
      return fail(res, 409, err.code, err.message);
    }
    if (err.code === 'EMAIL_SEND_FAILED') {
      return fail(res, 502, 'EMAIL_SEND_FAILED', 'Failed to send confirmation email, try again later');
    }
    // unexpected -> go to global errorHandler
    throw err;
  }
});

export const confirmEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return fail(res, 400, 'MISSING_TOKEN', 'Missing token');
  }
  const user = await authService.confirmEmail(token);
  return ok(res, { message: 'Email підтверджено успішно ✅', user });
});

export const resendConfirmation = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return fail(res, 400, 'EMAIL_REQUIRED', 'Email required');
  if (!isEmail(email)) return fail(res, 400, 'INVALID_EMAIL', 'Invalid email format');
  try {
    await authService.resendConfirmation(email);
    return ok(res, { ok: true });
  } catch (err: any) {
    // keep generic to avoid leaking info
    return fail(res, 500, 'RESEND_FAILED', 'Unable to resend confirmation');
  }
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, email, username, password } = req.body;
  const id = identifier ?? email ?? username;
  if (!id || !password) {
    return fail(res, 400, 'MISSING_FIELDS', 'Missing identifier (identifier|email|username) or password');
  }

  try {
    const { token, user } = await authService.login(id, password);
    return ok(res, { token, user });
  } catch (err: any) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }
    throw err;
  }
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  return ok(res, { user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return fail(res, 400, 'MISSING_FIELDS', 'Missing fields');
  if (!isPasswordValid(newPassword)) return fail(res, 400, 'INVALID_PASSWORD', 'New password does not meet requirements');

  try {
    await authService.changePassword(user.id, currentPassword, newPassword);
    return ok(res, { ok: true });
  } catch (err: any) {
    if (err.code === 'INVALID_PASSWORD') return fail(res, 400, 'INVALID_PASSWORD', err.message);
    throw err;
  }
});

export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return fail(res, 400, 'EMAIL_REQUIRED', 'Email required');
  if (!isEmail(email)) return fail(res, 400, 'INVALID_EMAIL', 'Invalid email format');

  try {
    await authService.requestPasswordReset(email);
    return ok(res, { ok: true });
  } catch (err: any) {
    throw err;
  }
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return fail(res, 400, 'MISSING_FIELDS', 'Missing fields');
  if (!isPasswordValid(newPassword)) return fail(res, 400, 'INVALID_PASSWORD', 'New password does not meet requirements');

  try {
    await authService.resetPassword(token, newPassword);
    return ok(res, { ok: true });
  } catch (err: any) {
    if (err.code === 'TOKEN_EXPIRED' || err.code === 'INVALID_TOKEN') {
      return fail(res, 400, err.code, err.message);
    }
    throw err;
  }
});
