import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../services/token.service.js';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError(401, 'Access token is invalid or expired', 'INVALID_TOKEN'));
  }
}
