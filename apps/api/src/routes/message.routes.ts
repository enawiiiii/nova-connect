import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { messageController } from '../controllers/message.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'application/pdf']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedTypes.has(file.mimetype)),
});
const attachmentLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
router.use(authenticate);
router.post('/:userId/attachments', attachmentLimiter, upload.single('file'), validate(z.object({
  body: z.object({ caption: z.string().max(4000).optional(), replyToId: z.string().uuid().optional() }).passthrough(),
  params: z.object({ userId: z.string().uuid() }),
  query: z.any(),
})), asyncHandler(messageController.attachment));
router.patch('/:id', validate(z.object({ body: z.object({ text: z.string().trim().min(1).max(4000) }).strict(), params: z.object({ id: z.string().uuid() }), query: z.any() })), asyncHandler(messageController.edit));
router.delete('/:id', validate(z.object({ body: z.any(), params: z.object({ id: z.string().uuid() }), query: z.any() })), asyncHandler(messageController.remove));
router.post('/:id/reactions', validate(z.object({ body: z.object({ emoji: z.string().min(1).max(16) }).strict(), params: z.object({ id: z.string().uuid() }), query: z.any() })), asyncHandler(messageController.react));
router.get('/:userId', validate(z.object({ body: z.any(), params: z.object({ userId: z.string().uuid() }), query: z.object({ before: z.string().datetime().optional() }) })), asyncHandler(messageController.conversation));
export default router;
