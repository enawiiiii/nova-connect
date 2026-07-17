import type { Request, Response } from 'express';
import { messageService } from '../services/message.service.js';

export const messageController = {
  async conversation(req: Request, res: Response) { res.json({ data: await messageService.conversation(req.user!.id, String(req.params.userId), req.query.before as string | undefined) }); },
};
