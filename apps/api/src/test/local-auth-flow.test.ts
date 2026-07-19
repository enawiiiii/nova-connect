import type { Express } from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../utils/errors.js';

process.env.LOCAL_DEVELOPMENT_MODE = 'true';
process.env.LOCAL_DATA_PATH = `.local/vitest-${process.pid}.json`;
process.env.BCRYPT_ROUNDS = '10';

let app: Express;
const suffix = `${process.pid}${Date.now().toString(36)}`;

beforeAll(async () => { ({ app } = await import('../app.js')); });

describe('local account flow', () => {
  it('registers, authenticates, refreshes, and updates a local account', async () => {
    const agent = request.agent(app);
    const registration = await agent.post('/api/v1/auth/register').send({
      username: `Local_${suffix}`,
      email: `local.${suffix}@example.com`,
      password: 'StrongPass123',
    });
    expect(registration.status).toBe(201);
    expect(registration.body.data.requiresEmailVerification).toBe(true);
    expect(registration.body.data.verificationCode).toMatch(/^\d{6}$/);

    const unverifiedLogin = await agent.post('/api/v1/auth/login').send({
      email: `local.${suffix}@example.com`,
      password: 'StrongPass123',
    });
    expect(unverifiedLogin.status).toBe(403);
    expect(unverifiedLogin.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const invalidCode = registration.body.data.verificationCode === '000000' ? '000001' : '000000';
    const wrongCode = await agent.post('/api/v1/auth/verify-email').send({
      email: `local.${suffix}@example.com`,
      code: invalidCode,
    });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.body.error.code).toBe('INVALID_VERIFICATION_CODE');

    const resend = await agent.post('/api/v1/auth/resend-verification').send({ email: `local.${suffix}@example.com` });
    expect(resend.status).toBe(200);
    expect(resend.body.data.verificationCode).toMatch(/^\d{6}$/);
    const replacedCode = await agent.post('/api/v1/auth/verify-email').send({
      email: `local.${suffix}@example.com`,
      code: registration.body.data.verificationCode,
    });
    expect(replacedCode.status).toBe(400);

    const verification = await agent.post('/api/v1/auth/verify-email').send({
      email: `local.${suffix}@example.com`,
      code: resend.body.data.verificationCode,
    });
    expect(verification.status).toBe(200);
    expect(verification.body.data.accessToken).toBeTypeOf('string');
    expect(verification.headers['set-cookie']?.[0]).toContain('nova_refresh=');
    const repeatedVerification = await agent.post('/api/v1/auth/verify-email').send({
      email: `local.${suffix}@example.com`,
      code: resend.body.data.verificationCode,
    });
    expect(repeatedVerification.status).toBe(400);

    const login = await agent.post('/api/v1/auth/login').send({
      email: `local.${suffix}@example.com`,
      password: 'StrongPass123',
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTypeOf('string');
    const originalRefreshCookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    expect(originalRefreshCookie).toBeTypeOf('string');

    const token = login.body.data.accessToken as string;
    const avatarImage = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 139, g: 92, b: 246, alpha: 1 } },
    }).png().toBuffer();
    const avatar = await agent.post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', avatarImage, { filename: 'profile.png', contentType: 'image/png' });
    expect(avatar.status).toBe(200);
    expect(avatar.body.data.avatar).toMatch(/^data:image\/webp;base64,/);

    const profile = await agent.get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.username).toBe(`Local_${suffix}`);

    const update = await agent.patch('/api/v1/users/me').set('Authorization', `Bearer ${token}`).send({ bio: 'Local flow verified' });
    expect(update.status).toBe(200);
    expect(update.body.data.bio).toBe('Local flow verified');

    const refresh = await agent.post('/api/v1/auth/refresh');
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toBeTypeOf('string');
    const secondTabRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalRefreshCookie!);
    expect(secondTabRefresh.status).toBe(200);
    expect(secondTabRefresh.body.data.accessToken).toBeTypeOf('string');
    const repeatedRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalRefreshCookie!);
    expect(repeatedRefresh.status).toBe(200);
    expect(repeatedRefresh.headers['set-cookie']?.[0]).toContain('Max-Age=34560000');

    const missingCookie = await request(app).post('/api/v1/auth/refresh');
    expect(missingCookie.status).toBe(401);
    expect(missingCookie.body.error.code).toBe('MISSING_REFRESH_TOKEN');
  });

  it('returns a useful password validation error', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({ username: `Weak_${suffix}`, email: `weak.${suffix}@example.com`, password: 'weakpass' });
    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe('Include an uppercase letter');
  });

  it('expires verification codes after fifteen minutes', async () => {
    const email = `expired.${suffix}@example.com`;
    const registration = await request(app).post('/api/v1/auth/register').send({
      username: `Expired_${suffix}`,
      email,
      password: 'StrongPass123',
    });
    expect(registration.status).toBe(201);

    const [{ localDb }, { authService }] = await Promise.all([
      import('../database/local.database.js'),
      import('../services/auth.service.js'),
    ]);
    await localDb.mutate((state) => {
      const user = state.users.find((item) => item.email === email)!;
      const stored = state.verificationTokens.find((item) => item.user_id === user.id)!;
      stored.expires_at = new Date(Date.now() - 1_000).toISOString();
    });

    await expect(authService.verifyEmail(email, registration.body.data.verificationCode)).rejects.toMatchObject<Partial<AppError>>({
      code: 'INVALID_VERIFICATION_CODE',
    });
  });

  it('allows an unverified email to restart registration instead of reserving it', async () => {
    const email = `pending.${suffix}@example.com`;
    const first = await request(app).post('/api/v1/auth/register').send({
      username: `PendingA_${suffix}`,
      email,
      password: 'StrongPass123',
    });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/auth/register').send({
      username: `PendingB_${suffix}`,
      email,
      password: 'NewStrongPass456',
    });
    expect(second.status).toBe(201);
    expect(second.body.data.user.username).toBe(`PendingB_${suffix}`);
    expect(second.body.data.verificationCode).not.toBe(first.body.data.verificationCode);

    const oldCode = await request(app).post('/api/v1/auth/verify-email').send({
      email,
      code: first.body.data.verificationCode,
    });
    expect(oldCode.status).toBe(400);
  });
});
