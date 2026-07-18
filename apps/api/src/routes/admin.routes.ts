import { Router } from 'express';
import { z } from 'zod';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const reportIdParams = z.object({ id: z.string().uuid() });
const reportStatus = z.enum(['open', 'reviewing', 'resolved', 'dismissed']);
const moderationAction = z.enum(['none', 'warn', 'protect_reporter', 'revoke_sessions', 'suspend_24h', 'suspend_7d', 'restore_account']);
router.use(authenticate, asyncHandler(requireAdmin));
router.get('/overview', asyncHandler(adminController.overview));
router.get('/reports', validate(z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    status: reportStatus.optional(),
    reason: z.enum(['spam', 'harassment', 'impersonation', 'unsafe', 'other']).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).strict(),
})), asyncHandler(adminController.reports));
router.get('/reports/:id', validate(z.object({ body: z.any(), params: reportIdParams, query: z.any() })), asyncHandler(adminController.reportDetail));
router.patch('/reports/:id', validate(z.object({
  body: z.object({
    status: reportStatus.optional(),
    action: moderationAction.optional(),
    note: z.string().trim().max(1000).optional(),
  }).strict().refine((value) => value.status !== undefined || value.action !== undefined || Boolean(value.note), 'Choose a status, action, or note'),
  params: reportIdParams,
  query: z.any(),
})), asyncHandler(adminController.updateReport));
router.get('/errors', asyncHandler(adminController.errors));
export default router;
