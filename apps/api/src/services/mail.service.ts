import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const mailTimeoutMs = 12_000;

export type MailDeliveryErrorCode =
  | 'EMAIL_PROVIDER_AUTH_FAILED'
  | 'EMAIL_SENDER_REJECTED'
  | 'EMAIL_PROVIDER_LIMIT'
  | 'EMAIL_PROVIDER_UNAVAILABLE'
  | 'EMAIL_DELIVERY_REJECTED';

export class MailDeliveryError extends Error {
  constructor(
    public readonly code: MailDeliveryErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

function sender() {
  const configured = env.MAIL_FROM.trim();
  const namedAddress = /^(.*?)\s*<([^<>]+)>$/.exec(configured);
  if (!namedAddress) return { name: 'NOVA Connect', email: configured };
  return {
    name: namedAddress[1]?.trim() || 'NOVA Connect',
    email: namedAddress[2]!.trim(),
  };
}

function verificationEmailContent(username: string, code: string) {
  return {
    subject: 'رمز تأكيد NOVA Connect',
    text: `مرحبًا ${username}، رمز تأكيد حسابك في NOVA Connect هو ${code}. ينتهي الرمز خلال 15 دقيقة ولا يمكن استخدامه إلا مرة واحدة.`,
    html: `
      <div dir="rtl" style="max-width:560px;margin:auto;padding:32px;background:#0d101a;color:#f4f4f7;border-radius:18px;font-family:Arial,sans-serif">
        <div style="color:#a78bfa;font-size:12px;letter-spacing:2px">NOVA CONNECT</div>
        <h1 style="font-size:24px;margin:18px 0 10px">تأكيد بريدك الإلكتروني</h1>
        <p style="color:#b5b7c2;line-height:1.8">مرحبًا ${username}، أدخل الرمز التالي لإكمال إنشاء حسابك:</p>
        <div dir="ltr" style="margin:24px 0;padding:18px;text-align:center;font:700 34px monospace;letter-spacing:10px;background:#171225;border:1px solid #4c3479;border-radius:14px;color:#d8ccff">${code}</div>
        <p style="color:#8d91a0;line-height:1.8">الرمز صالح لمدة 15 دقيقة ولمرة واحدة فقط. إذا لم تطلب إنشاء الحساب فتجاهل هذه الرسالة.</p>
      </div>
    `,
  };
}

function brevoErrorCode(status: number, details: string): MailDeliveryErrorCode {
  if (status === 401 || status === 403) return 'EMAIL_PROVIDER_AUTH_FAILED';
  if (status === 402 || status === 429) return 'EMAIL_PROVIDER_LIMIT';
  if (status === 400 && /sender|from|verified|authenticate/i.test(details)) return 'EMAIL_SENDER_REJECTED';
  if (status >= 500) return 'EMAIL_PROVIDER_UNAVAILABLE';
  return 'EMAIL_DELIVERY_REJECTED';
}

async function brevoRequest(payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(mailTimeoutMs),
        headers: {
          'api-key': env.BREVO_API_KEY!,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (attempt === 0) continue;
      throw new MailDeliveryError('EMAIL_PROVIDER_UNAVAILABLE', `Brevo request failed: ${error instanceof Error ? error.message : 'network error'}`);
    }
    if (response.ok) return true;
    const details = (await response.text()).slice(0, 500);
    const code = brevoErrorCode(response.status, details);
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
    throw new MailDeliveryError(code, `Brevo email request failed (${response.status}): ${details}`, response.status);
  }
  throw new MailDeliveryError('EMAIL_PROVIDER_UNAVAILABLE', 'Brevo email request failed');
}

async function sendWithBrevo(email: string, username: string, code: string) {
  const content = verificationEmailContent(username, code);
  return brevoRequest({
    sender: sender(),
    to: [{ email, name: username }],
    subject: content.subject,
    textContent: content.text,
    htmlContent: content.html,
    tags: ['account-verification'],
  });
}

async function sendWithSmtp(email: string, username: string, code: string) {
  const content = verificationEmailContent(username, code);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    connectionTimeout: mailTimeoutMs,
    greetingTimeout: mailTimeoutMs,
    socketTimeout: mailTimeoutMs,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  return true;
}

export async function sendVerificationEmail(email: string, username: string, code: string) {
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const selectedTransport = env.MAIL_TRANSPORT ?? (env.BREVO_API_KEY ? 'brevo' : 'smtp');
  if (selectedTransport === 'brevo' && env.BREVO_API_KEY) return sendWithBrevo(email, username, code);
  if (!hasSmtp) {
    if (env.NODE_ENV !== 'production') console.info(`[mail:dev] Verification code for ${email}: ${code}`);
    return false;
  }
  try {
    return await sendWithSmtp(email, username, code);
  } catch (error) {
    throw new MailDeliveryError('EMAIL_PROVIDER_UNAVAILABLE', `SMTP request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export function passwordResetUrl(token: string) {
  const clientOrigin = env.CLIENT_URL.split(',')[0]!.trim().replace(/\/$/, '');
  return `${clientOrigin}/forgot-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(email: string, username: string, token: string) {
  const resetUrl = passwordResetUrl(token);
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const selectedTransport = env.MAIL_TRANSPORT ?? (env.BREVO_API_KEY ? 'brevo' : 'smtp');
  if (selectedTransport === 'brevo' && env.BREVO_API_KEY) {
    return brevoRequest({
      sender: sender(),
      to: [{ email, name: username }],
      subject: 'Reset your NOVA Connect password',
      textContent: `Hi ${username}, reset your password: ${resetUrl}. This link expires in one hour.`,
      htmlContent: `<p>Hi ${username},</p><p><a href="${resetUrl}">Reset your NOVA Connect password</a>. This link expires in one hour.</p>`,
      tags: ['password-reset'],
    });
  }
  if (!hasSmtp) {
    if (env.NODE_ENV !== 'production') console.info(`[mail:dev] Reset ${email}: ${resetUrl}`);
    return false;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    connectionTimeout: mailTimeoutMs,
    greetingTimeout: mailTimeoutMs,
    socketTimeout: mailTimeoutMs,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: email,
    subject: 'Reset your NOVA Connect password',
    text: `Hi ${username}, reset your password: ${resetUrl}. This link expires in one hour.`,
    html: `<p>Hi ${username},</p><p><a href="${resetUrl}">Reset your NOVA Connect password</a>. This link expires in one hour.</p>`,
  });
  return true;
}
