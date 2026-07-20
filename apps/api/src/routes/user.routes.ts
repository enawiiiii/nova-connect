import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { userController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(new Error('Only JPEG, PNG, and WebP profile photos are allowed'));
    done(null, true);
  },
});
const avatarLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const accountDeletionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
router.use(authenticate);
router.get('/me', asyncHandler(userController.me));
router.get('/search', validate(z.object({ body: z.any(), params: z.any(), query: z.object({ q: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_]+$/) }) })), asyncHandler(userController.search));
router.post('/me/avatar', avatarLimiter, avatarUpload.single('avatar'), asyncHandler(userController.avatar));
router.get('/me/account', asyncHandler(userController.accountControls));
router.patch('/me/account', validate(z.object({ body: z.object({ showLastSeen: z.boolean().optional(), showAvatar: z.boolean().optional(), allowFriendRequests: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0), query: z.any(), params: z.any() })), asyncHandler(userController.updateAccountControls));
router.get('/me/export', asyncHandler(userController.exportAccount));
router.delete('/me', accountDeletionLimiter, validate(z.object({ body: z.object({ password: z.string().min(1).max(128) }).strict(), query: z.any(), params: z.any() })), asyncHandler(userController.deleteAccount));
router.patch('/me', validate(z.object({ body: z.object({ username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_]+$/).optional(), bio: z.string().max(280).nullable().optional(), status: z.enum(['online', 'away', 'busy', 'offline']).optional() }).strict().refine((value) => Object.keys(value).length > 0), query: z.any(), params: z.any() })), asyncHandler(userController.update));
export default router;
