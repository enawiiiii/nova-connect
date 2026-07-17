import { Router } from 'express';
import { z } from 'zod';
import { friendController } from '../controllers/friend.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate);
router.get('/', asyncHandler(friendController.list));
router.get('/requests', asyncHandler(friendController.requests));
router.post('/requests', validate(z.object({ body: z.object({ receiverId: z.string().uuid() }).strict(), query: z.any(), params: z.any() })), asyncHandler(friendController.send));
router.patch('/requests/:id', validate(z.object({ body: z.object({ action: z.enum(['accept', 'reject']) }).strict(), query: z.any(), params: z.object({ id: z.string().uuid() }) })), asyncHandler(friendController.respond));
router.delete('/:id', validate(z.object({ body: z.any(), query: z.any(), params: z.object({ id: z.string().uuid() }) })), asyncHandler(friendController.remove));
export default router;
