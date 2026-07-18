import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../services/token.service.js';
import { accountModerationService } from '../services/account-moderation.service.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  try {
    req.user = verifyAccessToken(token);
    await accountModerationService.assertCanAuthenticate(req.user.id);
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(401, 'Access token is invalid or expired', 'INVALID_TOKEN'));
  }
}
