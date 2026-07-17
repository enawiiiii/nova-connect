import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.middleware.js';
import rateLimit from 'express-rate-limit';
import { env, isLocalDevelopment } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const router = Router();
const password = z.string().min(8).max(128).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[a-z]/, 'Include a lowercase letter').regex(/[0-9]/, 'Include a number');
const trustedOrigins = new Set(env.CLIENT_URL.split(',').map((value) => value.trim()));
const requireTrustedOrigin = (req: Request, _res: Response, next: NextFunction) => {
  if (isLocalDevelopment || env.NODE_ENV === 'test') return next();
  const origin = req.get('origin');
  if (!origin || !trustedOrigins.has(origin)) return next(new AppError(403, 'Request origin is not allowed', 'UNTRUSTED_ORIGIN'));
  next();
};
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/register', registerLimiter, validate(z.object({ body: z.object({ username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_]+$/), email: z.string().trim().email().max(254), password }).strict(), query: z.any(), params: z.any() })), asyncHandler(authController.register));
router.post('/login', loginLimiter, validate(z.object({ body: z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict(), query: z.any(), params: z.any() })), asyncHandler(authController.login));
router.post('/refresh', requireTrustedOrigin, asyncHandler(authController.refresh));
router.post('/logout', requireTrustedOrigin, asyncHandler(authController.logout));
router.post('/verify-email', verificationLimiter, validate(z.object({ body: z.object({ token: z.string().min(20).max(256) }).strict(), query: z.any(), params: z.any() })), asyncHandler(authController.verify));
router.post('/resend-verification', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false }), validate(z.object({ body: z.object({ email: z.string().trim().email().max(254) }).strict(), query: z.any(), params: z.any() })), asyncHandler(authController.resendVerification));

export default router;
