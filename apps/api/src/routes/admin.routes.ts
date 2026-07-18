import { Router } from 'express';
import { z } from 'zod';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate, asyncHandler(requireAdmin));
router.get('/overview', asyncHandler(adminController.overview));
router.get('/reports', asyncHandler(adminController.reports));
router.patch('/reports/:id', validate(z.object({ body: z.object({ status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']) }).strict(), params: z.object({ id: z.string().uuid() }), query: z.any() })), asyncHandler(adminController.updateReport));
router.get('/errors', asyncHandler(adminController.errors));
export default router;
