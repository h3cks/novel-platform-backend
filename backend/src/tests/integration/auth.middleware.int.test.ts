// src/tests/integration/auth.middleware.int.test.ts
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

jest.mock('../../prisma/client', () => {
  const mock = require('../../__mocks__/prisma/client');
  return mock;
});

import prisma from '../../prisma/client'; // тепер це буде mocked object
import { JWT_SECRET } from '../../config';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { authOptional } from '../../middlewares/authOptional.middleware';

const makeApp = () => {
  const app = express();
  app.get('/protected', authMiddleware, (req, res) => {
    return res.status(200).json({ user: (req as any).user });
  });
  app.get('/optional', authOptional, (req, res) => {
    return res.status(200).json({ user: (req as any).user ?? null });
  });
  return app;
};

beforeEach(() => {
  // reset mocks
  if ((prisma as any).__resetAllMocks) (prisma as any).__resetAllMocks();
});

describe('authMiddleware (integration with prisma mock + jwt)', () => {
  const app = makeApp();

  const sign = (payload: any, opts: any = {}) =>
    jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', ...(opts as any) });

  test('missing Authorization header => 401', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing Authorization header' });
  });

  test('bad header format => 401', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bad token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid Authorization header format' });
  });

  test('token without payload sub/userId => 401', async () => {
    const token = sign({}); // no sub/userId
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token payload' });
  });

  test('token with non-numeric subject => 401', async () => {
    const token = sign({ sub: 'not-a-number' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token subject' });
  });

  test('valid token but user not found in DB => 401', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const token = sign({ sub: 123 });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 123 } });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  test('valid token but email not confirmed => 403', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 5,
      username: 'u',
      email: 'a@b.c',
      role: 'user',
      emailConfirmed: false,
      createdAt: new Date().toISOString(),
    });
    const token = sign({ sub: 5 });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Email not confirmed' });
  });

  test('valid token and user found & confirmed => next() and attach user', async () => {
    const user = {
      id: 7,
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
    };
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    const token = sign({ sub: 7 });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({
      id: 7,
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
      emailConfirmed: true,
    });
  });

  test('expired token => 401 (Token expired)', async () => {
    const token = jwt.sign({ sub: 1, exp: Math.floor(Date.now() / 1000) - 10 }, JWT_SECRET, {
      algorithm: 'HS256',
    });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token expired' });
  });
});

describe('authOptional middleware (integration)', () => {
  const app = makeApp();
  const sign = (payload: any) => jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });

  test('no header => next() and user===null', async () => {
    const res = await request(app).get('/optional');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  test('invalid token => next() and user===null', async () => {
    const res = await request(app).get('/optional').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  test('valid token & user found => attach user', async () => {
    const user = {
      id: 9,
      username: 'bob',
      email: 'bob@example.com',
      role: 'user',
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
    };
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    const token = sign({ sub: 9 });
    const res = await request(app).get('/optional').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 9, username: 'bob', email: 'bob@example.com' });
  });
});
