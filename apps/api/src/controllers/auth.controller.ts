import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

export const refreshCookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/api/v1/auth', maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 };

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
