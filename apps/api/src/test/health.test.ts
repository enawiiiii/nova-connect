import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../app.js';

describe('health endpoint', () => {
  it('reports service readiness', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'nova-connect-api', release: 'persistent-session-v1' });
  });

  it('returns a structured 404', async () => {
    const response = await request(app).get('/missing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns a client error for malformed JSON', async () => {
    const response = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('rejects oversized JSON without exposing an internal error', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: `${'a'.repeat(40_000)}@example.com`,
      password: 'Password123',
    });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.headers['cache-control']).toContain('no-store');
  });
});
