import { Router } from 'express';
import { z } from 'zod';
import { pushController } from '../controllers/push.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const subscription = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(512), auth: z.string().min(8).max(256) }).strict(),
}).strict();

router.use(authenticate);
router.get('/config', pushController.config);
router.post('/subscribe', validate(z.object({ body: z.object({ subscription }).strict(), query: z.any(), params: z.any() })), asyncHandler(pushController.subscribe));
router.delete('/subscribe', validate(z.object({ body: z.object({ endpoint: z.string().url().max(2048) }).strict(), query: z.any(), params: z.any() })), asyncHandler(pushController.unsubscribe));

export default router;
