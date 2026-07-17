import { Router } from 'express';
import { z } from 'zod';
import { callController } from '../controllers/call.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate);
router.get('/ice-servers', asyncHandler(callController.iceServers));
router.get('/', asyncHandler(callController.list));
router.post('/', validate(z.object({ body: z.object({ receiverId: z.string().uuid().nullable().optional(), participantIds: z.array(z.string().uuid()).max(7).default([]), callType: z.enum(['voice', 'video', 'group']), roomId: z.string().uuid() }).strict(), query: z.any(), params: z.any() })), asyncHandler(callController.start));
router.post('/rooms/:roomId/leave', validate(z.object({ body: z.any(), query: z.any(), params: z.object({ roomId: z.string().uuid() }) })), asyncHandler(callController.leaveRoom));
router.patch('/:id', validate(z.object({ body: z.object({ duration: z.number().int().min(0).max(604_800), status: z.enum(['answered', 'declined', 'missed', 'ended']) }).strict(), query: z.any(), params: z.object({ id: z.string().uuid() }) })), asyncHandler(callController.finish));
export default router;
