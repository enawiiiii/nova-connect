import { Router } from 'express';
import { z } from 'zod';
import { groupController } from '../controllers/group.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const id = z.string().uuid();
router.use(authenticate);
router.get('/', asyncHandler(groupController.list));
router.post('/', validate(z.object({ body: z.object({ name: z.string().trim().min(2).max(80), memberIds: z.array(id).min(1).max(49) }).strict(), params: z.any(), query: z.any() })), asyncHandler(groupController.create));
router.get('/:id/messages', validate(z.object({ body: z.any(), params: z.object({ id }), query: z.any() })), asyncHandler(groupController.messages));
router.post('/:id/messages', validate(z.object({ body: z.object({ text: z.string().trim().min(1).max(4000) }).strict(), params: z.object({ id }), query: z.any() })), asyncHandler(groupController.send));
router.patch('/:id/members', validate(z.object({ body: z.object({ addIds: z.array(id).max(49).default([]), removeIds: z.array(id).max(49).default([]) }).strict(), params: z.object({ id }), query: z.any() })), asyncHandler(groupController.members));
export default router;
