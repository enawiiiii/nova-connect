import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'APP_ERROR',
  ) {
    super(message);
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, `Route ${req.method} ${req.path} was not found`, 'NOT_FOUND'));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON' } });
  }
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? 'Invalid request', details: error.flatten() },
    });
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Profile photos must be 2 MB or smaller' : 'Could not upload this file';
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
  if (error instanceof Error && error.message === 'Only JPEG, PNG, and WebP profile photos are allowed') {
    return res.status(400).json({ error: { code: 'INVALID_AVATAR_TYPE', message: error.message } });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
  }
  console.error(error);
  void import('../services/monitoring.service.js').then(({ monitoringService }) => monitoringService.record({
    userId: req.user?.id ?? null,
    source: 'api',
    message: error instanceof Error ? error.message : 'Unknown server error',
    details: error instanceof Error ? { name: error.name, stack: error.stack?.slice(0, 4000) } : null,
    path: req.originalUrl,
    userAgent: req.get('user-agent'),
  })).catch(() => undefined);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
