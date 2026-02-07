// src/tests/auth.service.test.ts
/**
 * Tests for auth.service
 *
 * - Uses centralized prisma mock (src/__mocks__/prisma/client.ts).
 * - Reset modules and mocks between tests.
 */

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn().mockResolvedValue(true),
  },
}));

// Explicitly map prisma to our centralized mock factory
jest.mock('../prisma/client', () => require('../__mocks__/prisma/client'));

jest.mock('../services/email.service', () => ({
  __esModule: true,
  sendConfirmationEmail: jest.fn().mockResolvedValue({ previewUrl: null }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ previewUrl: null }),
}));

beforeEach(() => {
  jest.resetModules();
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe('auth.service', () => {
  test('registerUser creates user and sends confirmation email when email provided', async () => {
    const prisma: any = require('../prisma/client');
    // uniqueness checks
    prisma.user.findUnique.mockResolvedValueOnce(null); // email check
    prisma.user.findUnique.mockResolvedValueOnce(null); // username check (if used)

    const now = new Date();
    const created = {
      id: 10,
      email: 'x@y.com',
      username: null,
      password: 'hashed-password',
      emailConfirmed: false,
      createdAt: now,
      avatarUrl: null,
      role: 'READER',
      displayName: null,
    };
    prisma.user.create.mockResolvedValueOnce(created);
    prisma.user.update.mockResolvedValueOnce({ ...created, emailConfirmToken: 'tok' });

    const authService = require('../services/auth.service');
    const user = await authService.registerUser({ email: 'x@y.com', password: 'Aa1!aaaa' } as any);

    expect(user).toBeDefined();
    const emailService = require('../services/email.service');
    expect(emailService.sendConfirmationEmail).toHaveBeenCalledWith('x@y.com', expect.any(String));
    const bcrypt = require('bcrypt').default;
    expect(bcrypt.hash).toHaveBeenCalled();
  });

  test('registerUser throws EMAIL_TAKEN if email exists', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'a@b' });

    const authService = require('../services/auth.service');
    await expect(authService.registerUser({ email: 'a@b', password: 'pw' } as any))
      .rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  test('login throws on missing user', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const authService = require('../services/auth.service');
    await expect(authService.login('nope', 'pw')).rejects.toThrow();
  });

  test('login returns token and user when credentials valid', async () => {
    const prisma: any = require('../prisma/client');
    const u = {
      id: 1,
      password: 'hashed-password',
      email: 'a@b.com',
      username: 'u',
      displayName: null,
      avatarUrl: null,
      role: 'READER',
      emailConfirmed: true,
      createdAt: new Date(),
    };
    prisma.user.findUnique.mockResolvedValueOnce(u);

    const authService = require('../services/auth.service');
    const res = await authService.login(u.email!, 'pw');

    expect(res).toHaveProperty('token');
    expect(res).toHaveProperty('user');
    expect(res.user.id).toBe(u.id);
  });

  test('confirmEmail: success path', async () => {
    const prisma: any = require('../prisma/client');
    const token = 'plain-token';
    const hashed = 'hashed-token';
    const crypto = require('../utils/crypto');
    jest.spyOn(crypto, 'hashToken').mockReturnValue(hashed);

    prisma.user.findFirst.mockResolvedValueOnce({
      id: 5,
      emailConfirmToken: hashed,
      emailConfirmed: false,
      emailConfirmExpires: new Date(Date.now() + 1000 * 60 * 60),
      email: 'a@b.com',
      username: 'u',
      displayName: null,
      avatarUrl: null,
      role: 'READER',
      createdAt: new Date(),
    } as any);

    prisma.user.update.mockResolvedValueOnce({
      id: 5,
      emailConfirmed: true,
      email: 'a@b.com',
      username: 'u',
      displayName: null,
      avatarUrl: null,
      role: 'READER',
      createdAt: new Date(),
    } as any);

    const authService = require('../services/auth.service');
    const res = await authService.confirmEmail(token);

    expect(res).toHaveProperty('id', 5);
    crypto.hashToken.mockRestore();
  });

  test('changePassword: wrong current password throws', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 7, password: 'hashed' } as any);
    const bcrypt = require('bcrypt').default;
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    const authService = require('../services/auth.service');
    await expect(authService.changePassword(7, 'wrong', 'newpass')).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
    });
  });

  test('changePassword: success updates password', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 8, password: 'hashed' } as any);
    const bcrypt = require('bcrypt').default;
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    prisma.user.update.mockResolvedValueOnce({ id: 8 } as any);

    const authService = require('../services/auth.service');
    const ok = await authService.changePassword(8, 'cur', 'newpass');

    expect(ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { password: expect.any(String) } });
  });

  test('requestPasswordReset: no user returns quietly', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const authService = require('../services/auth.service');
    await expect(authService.requestPasswordReset('no@one')).resolves.toBeUndefined();
  });

  test('resetPassword: invalid token throws', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findFirst.mockResolvedValueOnce(null);

    const authService = require('../services/auth.service');
    await expect(authService.resetPassword('badtoken', 'newpass')).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  test('resetPassword: success', async () => {
    const prisma: any = require('../prisma/client');
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 9,
      passwordResetExpires: new Date(Date.now() + 1000 * 60 * 60),
    } as any);
    prisma.user.update.mockResolvedValueOnce({ id: 9 } as any);

    const authService = require('../services/auth.service');
    const ok = await authService.resetPassword('goodtoken', 'newpass');

    expect(ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
