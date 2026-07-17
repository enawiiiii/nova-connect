import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export const validate = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
  const parsed = schema.parse({ body: req.body, query: req.query, params: req.params });
  const values = parsed as { body?: unknown; params?: Record<string, string> };
  if (values.body !== undefined) req.body = values.body;
  if (values.params !== undefined) req.params = values.params;
  next();
};
