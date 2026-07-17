import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../services/token.service.js';

describe('access tokens', () => {
  it('round-trips authenticated user claims', () => {
    const user = { id: '9da1c2c6-cacf-4d7b-a6e8-e24d2f09e923', email: 'nova@example.com', username: 'nova' };
    expect(verifyAccessToken(signAccessToken(user))).toEqual(user);
  });
});
