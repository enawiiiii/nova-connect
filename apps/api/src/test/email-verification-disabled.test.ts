import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.LOCAL_DEVELOPMENT_MODE = 'true';
process.env.LOCAL_DATA_PATH = `.local/vitest-no-verification-${process.pid}.json`;
process.env.BCRYPT_ROUNDS = '10';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

let app: Express;
const suffix = `${process.pid}${Date.now().toString(36)}`;

beforeAll(async () => {
  ({ app } = await import('../app.js'));
});

describe('registration with email verification disabled', () => {
  it('creates an authenticated session and allows immediate login', async () => {
    const credentials = {
      username: `Quick_${suffix}`,
      email: `quick.${suffix}@example.com`,
      password: 'StrongPass123',
    };

    const registration = await request(app).post('/api/v1/auth/register').send(credentials);
    expect(registration.status).toBe(201);
    expect(registration.body.data.requiresEmailVerification).toBe(false);
    expect(registration.body.data.accessToken).toBeTypeOf('string');
    expect(registration.headers['set-cookie']?.[0]).toContain('nova_refresh=');

    const login = await request(app).post('/api/v1/auth/login').send({
      email: credentials.email,
      password: credentials.password,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTypeOf('string');
  });
});
