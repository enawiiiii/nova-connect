import type { NextFunction, Request, Response } from 'express';
import { db } from '../database/supabase.js';
import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const allowed = isLocalDevelopment
      ? await localDb.read((state) => Boolean(state.users.find((item) => item.id === req.user?.id)?.is_admin))
      : Boolean((await db.from('users').select('is_admin').eq('id', req.user!.id).maybeSingle()).data?.is_admin);
    if (!allowed) return next(new AppError(403, 'Administrator access required', 'ADMIN_REQUIRED'));
    next();
  } catch (error) {
    next(error);
  }
}
