import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate, rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }));
router.post('/client-errors', validate(z.object({ body: z.object({ message: z.string().trim().min(1).max(1000), path: z.string().max(500).optional(), details: z.record(z.string(), z.unknown()).optional() }).strict(), params: z.any(), query: z.any() })), asyncHandler(adminController.clientError));
export default router;
