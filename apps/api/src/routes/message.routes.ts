import { Router } from 'express';
import { z } from 'zod';
import { messageController } from '../controllers/message.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate);
router.get('/:userId', validate(z.object({ body: z.any(), params: z.object({ userId: z.string().uuid() }), query: z.object({ before: z.string().datetime().optional() }) })), asyncHandler(messageController.conversation));
export default router;
