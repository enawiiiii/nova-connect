import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export function verificationUrl(token: string) {
  const clientOrigin = env.CLIENT_URL.split(',')[0]!.trim().replace(/\/$/, '');
  return `${clientOrigin}/verify-email?token=${encodeURIComponent(token)}`;
}

export function localVerificationPath(token: string) {
  return `/verify-email?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(email: string, username: string, token: string) {
  const verifyUrl = verificationUrl(token);
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    if (env.NODE_ENV !== 'production') console.info(`[mail:dev] Verify ${email}: ${verifyUrl}`);
    return false;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
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
