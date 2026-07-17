import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.CLIENT_URL = 'https://nova-connect.onrender.com';
process.env.BREVO_API_KEY = 'brevo-test-key';
process.env.MAIL_FROM = 'NOVA Connect <connextnova@gmail.com>';

const fetchMock = vi.fn().mockResolvedValue(new Response(
  JSON.stringify({ messageId: '<verification@example.com>' }),
  { status: 201, headers: { 'Content-Type': 'application/json' } },
));

let sendVerificationEmail: typeof import('../services/mail.service.js').sendVerificationEmail;

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  ({ sendVerificationEmail } = await import('../services/mail.service.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('verification email', () => {
  it('uses the Brevo HTTPS API with the configured sender and verification URL', async () => {
    await expect(sendVerificationEmail('person@example.com', 'NovaUser', 'verification-token')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request.headers).toMatchObject({ 'api-key': 'brevo-test-key' });

    const payload = JSON.parse(request.body as string) as {
      sender: { name: string; email: string };
      to: Array<{ email: string; name: string }>;
      htmlContent: string;
    };
    expect(payload.sender).toEqual({ name: 'NOVA Connect', email: 'connextnova@gmail.com' });
    expect(payload.to).toEqual([{ email: 'person@example.com', name: 'NovaUser' }]);
    expect(payload.htmlContent).toContain('https://nova-connect.onrender.com/verify-email?token=verification-token');
  });
});
