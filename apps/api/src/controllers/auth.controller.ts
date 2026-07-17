import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

const cookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/api/v1/auth', maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 };

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    if (!result.requiresEmailVerification) {
      res.cookie('nova_refresh', result.refreshToken, cookieOptions);
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
        verificationUrl: result.verificationUrl,
      },
      message: 'Account created. Check your email to verify it.',
    });
  },
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);
    res.cookie('nova_refresh', result.refreshToken, cookieOptions);
    res.json({ data: { user: result.user, accessToken: result.accessToken } });
  },
  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.cookies.nova_refresh);
    res.cookie('nova_refresh', result.refreshToken, cookieOptions);
    res.json({ data: { accessToken: result.accessToken } });
  },
  async logout(req: Request, res: Response) {
    await authService.logout(req.cookies.nova_refresh);
    res.clearCookie('nova_refresh', cookieOptions);
    res.status(204).send();
  },
  async verify(req: Request, res: Response) {
    await authService.verifyEmail(req.body.token);
    res.json({ data: { verified: true }, message: 'Email verified' });
  },
  async resendVerification(req: Request, res: Response) {
    const result = await authService.resendVerification(req.body.email);
    res.json({
      data: {
        sent: result.emailSent,
        verificationUrl: result.verificationUrl,
      },
      message: 'If this email is awaiting verification, a new link has been sent.',
    });
  },
};
