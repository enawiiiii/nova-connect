import { Router } from 'express';
import { z } from 'zod';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate);
router.get('/', asyncHandler(notificationController.list));
router.patch('/read-all', asyncHandler(notificationController.markRead));
router.patch('/:id/read', validate(z.object({ body: z.any(), query: z.any(), params: z.object({ id: z.string().uuid() }) })), asyncHandler(notificationController.markRead));
export default router;
