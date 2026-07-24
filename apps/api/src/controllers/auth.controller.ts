import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/errors.js';

export const refreshCookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/api/v1/auth', maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 };
const googlePendingCookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/api/v1/auth/google', maxAge: 10 * 60 * 1_000 };

function googleCallbackUrl(parameters: Record<string, string>) {
  const clientUrl = env.CLIENT_URL.split(',')[0]!.trim();
  const callback = new URL('/auth/google/callback', clientUrl);
  Object.entries(parameters).forEach(([key, value]) => callback.searchParams.set(key, value));
  return callback.toString();
}

function csrfTokensMatch(cookieToken: unknown, bodyToken: unknown) {
  if (typeof cookieToken !== 'string' || typeof bodyToken !== 'string' || !cookieToken || !bodyToken) return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const bodyBuffer = Buffer.from(bodyToken);
  return cookieBuffer.length === bodyBuffer.length && crypto.timingSafeEqual(cookieBuffer, bodyBuffer);
}

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body, { userAgent: req.get('user-agent'), ip: req.ip });
    if (!result.requiresEmailVerification) {
      res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
      res.status(201).json({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          requiresEmailVerification: false,
        },
        message: 'Account created.',
      });
      return;
    }
    res.status(201).json({
      data: {
        user: result.user,
        requiresEmailVerification: true,
        emailSent: result.emailSent,
        verificationCode: result.verificationCode,
      },
      message: 'Account created. Check your email to verify it.',
    });
  },
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
    res.json({ data: { user: result.user, accessToken: result.accessToken } });
  },
  async google(req: Request, res: Response) {
    const result = await authService.google(req.body, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
    res.json({ data: { user: result.user, accessToken: result.accessToken, created: result.created } });
  },
  async googleRedirect(req: Request, res: Response) {
    const credential = req.body?.credential;
    const csrfToken = req.body?.g_csrf_token;
    if (!csrfTokensMatch(req.cookies.g_csrf_token, csrfToken)) {
      return res.redirect(303, googleCallbackUrl({ error: 'GOOGLE_CSRF_INVALID' }));
    }
    if (typeof credential !== 'string' || credential.length < 100 || credential.length > 10_000) {
      return res.redirect(303, googleCallbackUrl({ error: 'GOOGLE_CREDENTIAL_INVALID' }));
    }
    try {
      const result = await authService.google({ credential }, { userAgent: req.get('user-agent'), ip: req.ip });
      res.clearCookie('nova_google_pending', googlePendingCookieOptions);
      res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
      return res.redirect(303, googleCallbackUrl({ status: 'complete' }));
    } catch (error) {
      if (error instanceof AppError && error.code === 'TWO_FACTOR_REQUIRED') {
        res.cookie('nova_google_pending', credential, googlePendingCookieOptions);
        return res.redirect(303, googleCallbackUrl({ status: 'two-factor' }));
      }
      const code = error instanceof AppError ? error.code : 'GOOGLE_AUTH_FAILED';
      if (!(error instanceof AppError)) console.error('Google redirect authentication failed', error);
      res.clearCookie('nova_google_pending', googlePendingCookieOptions);
      return res.redirect(303, googleCallbackUrl({ error: code }));
    }
  },
  async googleRedirectTotp(req: Request, res: Response) {
    const credential = req.cookies.nova_google_pending;
    if (typeof credential !== 'string' || credential.length < 100 || credential.length > 10_000) {
      throw new AppError(400, 'Google sign-in has expired. Please try again.', 'GOOGLE_REDIRECT_EXPIRED');
    }
    const result = await authService.google(
      { credential, totpCode: req.body.code },
      { userAgent: req.get('user-agent'), ip: req.ip },
    );
    res.clearCookie('nova_google_pending', googlePendingCookieOptions);
    res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
    res.json({ data: { user: result.user, accessToken: result.accessToken, created: result.created } });
  },
  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.cookies.nova_refresh);
    res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
    res.json({ data: { accessToken: result.accessToken } });
  },
  async logout(req: Request, res: Response) {
    await authService.logout(req.cookies.nova_refresh);
    res.clearCookie('nova_refresh', refreshCookieOptions);
    res.status(204).send();
  },
  async verify(req: Request, res: Response) {
    const result = await authService.verifyEmail(req.body.email, req.body.code, { userAgent: req.get('user-agent'), ip: req.ip });
    res.cookie('nova_refresh', result.refreshToken, refreshCookieOptions);
    res.json({
      data: {
        verified: true,
        user: result.user,
        accessToken: result.accessToken,
      },
      message: 'Email verified',
    });
  },
  async resendVerification(req: Request, res: Response) {
    const result = await authService.resendVerification(req.body.email);
    res.json({
      data: {
        sent: result.emailSent,
        verificationCode: result.verificationCode,
      },
      message: 'If this email is awaiting verification, a new code has been sent.',
    });
  },
  async sessions(req: Request, res: Response) { res.json({ data: await authService.sessions(req.user!.id) }); },
  async revokeSession(req: Request, res: Response) { await authService.revokeSession(req.user!.id, String(req.params.id)); res.status(204).send(); },
  async changePassword(req: Request, res: Response) { await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword, req.cookies.nova_refresh); res.status(204).send(); },
  async setupTotp(req: Request, res: Response) { res.json({ data: await authService.setupTotp(req.user!.id) }); },
  async enableTotp(req: Request, res: Response) { await authService.enableTotp(req.user!.id, req.body.code); res.status(204).send(); },
  async disableTotp(req: Request, res: Response) { await authService.disableTotp(req.user!.id, req.body.code); res.status(204).send(); },
  async requestPasswordReset(req: Request, res: Response) {
    const result = await authService.requestPasswordReset(req.body.email);
    res.json({ data: result, message: 'If an account exists for this email, a password reset link has been sent.' });
  },
  async resetPassword(req: Request, res: Response) { await authService.resetPassword(req.body.token, req.body.password); res.status(204).send(); },
};
