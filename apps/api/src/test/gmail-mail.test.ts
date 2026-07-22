import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.CLIENT_URL = 'https://nova-connect.onrender.com';
process.env.MAIL_TRANSPORT = 'gmail-api';
process.env.GMAIL_CLIENT_ID = 'gmail-client.apps.googleusercontent.com';
process.env.GMAIL_CLIENT_SECRET = 'gmail-client-secret';
process.env.GMAIL_REFRESH_TOKEN = 'gmail-refresh-token';
process.env.GMAIL_SENDER = 'novaconnect.verify@gmail.com';
process.env.MAIL_FROM = 'NOVA Connect <novaconnect.verify@gmail.com>';

const fetchMock = vi.fn();
let sendVerificationEmail: typeof import('../services/mail.service.js').sendVerificationEmail;

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  ({ sendVerificationEmail } = await import('../services/mail.service.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('Gmail API delivery', () => {
  it('refreshes OAuth and sends a MIME message over HTTPS', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'temporary-access-token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-message-id' }), { status: 200 }));

    await expect(sendVerificationEmail('person@gmail.com', 'NovaUser', '483920')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(tokenRequest.body)).toContain('refresh_token=gmail-refresh-token');

    const [sendUrl, sendRequest] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(sendRequest.headers).toMatchObject({ Authorization: 'Bearer temporary-access-token' });
    const payload = JSON.parse(sendRequest.body as string) as { raw: string };
    const mime = Buffer.from(payload.raw, 'base64url').toString('utf8');
    expect(mime).toContain('From:');
    expect(mime).toContain('<novaconnect.verify@gmail.com>');
    expect(mime).toContain('To: person@gmail.com');
    expect(mime).not.toContain('gmail-client-secret');
    expect(mime).not.toContain('gmail-refresh-token');
  });

  it('classifies an expired or revoked refresh token', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));

    await expect(sendVerificationEmail('person@gmail.com', 'NovaUser', '483920')).rejects.toMatchObject({
      code: 'EMAIL_PROVIDER_AUTH_FAILED',
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
