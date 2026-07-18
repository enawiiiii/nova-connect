import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const mailTimeoutMs = 12_000;

export function verificationUrl(token: string) {
  const clientOrigin = env.CLIENT_URL.split(',')[0]!.trim().replace(/\/$/, '');
  return `${clientOrigin}/verify-email?token=${encodeURIComponent(token)}`;
}

export function localVerificationPath(token: string) {
  return `/verify-email?token=${encodeURIComponent(token)}`;
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

async function sendWithBrevo(email: string, username: string, verifyUrl: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(mailTimeoutMs),
    headers: {
      'api-key': env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: sender(),
      to: [{ email, name: username }],
      subject: 'Verify your NOVA Connect account',
      textContent: `Hi ${username}, verify your account: ${verifyUrl}`,
      htmlContent: `<p>Hi ${username},</p><p><a href="${verifyUrl}">Verify your NOVA Connect account</a>.</p>`,
      tags: ['account-verification'],
    }),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Brevo email request failed (${response.status}): ${details}`);
  }
  return true;
}

async function sendWithSmtp(email: string, username: string, verifyUrl: string) {
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
    subject: 'Verify your NOVA Connect account',
    text: `Hi ${username}, verify your account: ${verifyUrl}`,
    html: `<p>Hi ${username},</p><p><a href="${verifyUrl}">Verify your NOVA Connect account</a>.</p>`,
  });
  return true;
}

export async function sendVerificationEmail(email: string, username: string, token: string) {
  const verifyUrl = verificationUrl(token);
  if (env.BREVO_API_KEY) return sendWithBrevo(email, username, verifyUrl);
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    if (env.NODE_ENV !== 'production') console.info(`[mail:dev] Verify ${email}: ${verifyUrl}`);
    return false;
  }
  return sendWithSmtp(email, username, verifyUrl);
}

export function passwordResetUrl(token: string) {
  const clientOrigin = env.CLIENT_URL.split(',')[0]!.trim().replace(/\/$/, '');
  return `${clientOrigin}/forgot-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(email: string, username: string, token: string) {
  const resetUrl = passwordResetUrl(token);
  if (env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(mailTimeoutMs),
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: sender(),
        to: [{ email, name: username }],
        subject: 'Reset your NOVA Connect password',
        textContent: `Hi ${username}, reset your password: ${resetUrl}. This link expires in one hour.`,
        htmlContent: `<p>Hi ${username},</p><p><a href="${resetUrl}">Reset your NOVA Connect password</a>. This link expires in one hour.</p>`,
        tags: ['password-reset'],
      }),
    });
    if (!response.ok) throw new Error(`Brevo password reset request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    return true;
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
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
