import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { privacyController } from '../controllers/privacy.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const id = z.string().uuid();
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
router.use(authenticate);
router.get('/blocked', asyncHandler(privacyController.blocked));
router.post('/block', validate(z.object({ body: z.object({ userId: id }).strict(), params: z.any(), query: z.any() })), asyncHandler(privacyController.block));
router.delete('/block/:userId', validate(z.object({ body: z.any(), params: z.object({ userId: id }), query: z.any() })), asyncHandler(privacyController.unblock));
router.post('/reports', reportLimiter, validate(z.object({ body: z.object({ userId: id, reason: z.enum(['spam', 'harassment', 'impersonation', 'unsafe', 'other']), details: z.string().max(1000).optional() }).strict(), params: z.any(), query: z.any() })), asyncHandler(privacyController.report));
export default router;
