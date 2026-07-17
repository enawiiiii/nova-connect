import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, configureApiAuth } from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API session recovery', () => {
  it('keeps the session when refresh fails because the server is temporarily unavailable', async () => {
    const onUnauthorized = vi.fn();
    configureApiAuth({ onAccessToken: vi.fn(), onUnauthorized });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch')));

    await expect(api('/friends', { token: 'expired' })).rejects.toThrow('Failed to fetch');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('clears the session only when the refresh token is definitively rejected', async () => {
    const onUnauthorized = vi.fn();
    configureApiAuth({ onAccessToken: vi.fn(), onUnauthorized });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } })));

    await expect(api('/friends', { token: 'expired' })).rejects.toThrow('Your session has expired');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
