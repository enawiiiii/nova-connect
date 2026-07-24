import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyGoogleCredentialMock } = vi.hoisted(() => ({
  verifyGoogleCredentialMock: vi.fn(),
}));

vi.mock('../services/google-identity.service.js', () => ({
  verifyGoogleCredential: verifyGoogleCredentialMock,
}));

process.env.LOCAL_DEVELOPMENT_MODE = 'true';
process.env.LOCAL_DATA_PATH = `.local/vitest-google-auth-${process.pid}.json`;
process.env.BCRYPT_ROUNDS = '10';
process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
process.env.GOOGLE_AUTH_ENABLED = 'true';
process.env.GOOGLE_AUTH_CLIENT_ID = '123456789-nova-test.apps.googleusercontent.com';

let app: Express;
const credential = 'google-id-token'.padEnd(120, 'x');

beforeAll(async () => {
  ({ app } = await import('../app.js'));
});

beforeEach(() => {
  verifyGoogleCredentialMock.mockReset();
  verifyGoogleCredentialMock.mockResolvedValue({
    subject: '109876543210987654321',
    email: 'google.user@gmail.com',
    emailVerified: true,
    name: 'Google User',
    picture: 'https://example.com/avatar.png',
  });
});

describe('Google authentication flow', () => {
  it('creates a verified account and reuses the same Google identity', async () => {
    const first = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential });

    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(true);
    expect(first.body.data.user.email).toBe('google.user@gmail.com');
    expect(first.body.data.user.avatar).toBe('https://example.com/avatar.png');
    expect(first.body.data.accessToken).toBeTypeOf('string');
    expect(first.headers['set-cookie']?.[0]).toContain('nova_refresh=');

    const second = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential });

    expect(second.status).toBe(200);
    expect(second.body.data.created).toBe(false);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(verifyGoogleCredentialMock).toHaveBeenCalledTimes(2);
  });
});
