import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from '../services/token.service.js';

describe('access tokens', () => {
  it('round-trips authenticated user claims', () => {
    const user = { id: '9da1c2c6-cacf-4d7b-a6e8-e24d2f09e923', email: 'nova@example.com', username: 'nova' };
    const token = signAccessToken(user);
    expect(verifyAccessToken(token)).toEqual(user);
    expect(jwt.decode(token, { complete: true })?.header.alg).toBe('HS256');
  });
});
