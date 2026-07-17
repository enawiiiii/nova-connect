import type { Request, Response } from 'express';
import { notificationService } from '../services/notification.service.js';

export const notificationController = {
  async list(req: Request, res: Response) { res.json({ data: await notificationService.list(req.user!.id) }); },
  async markRead(req: Request, res: Response) { await notificationService.markRead(req.user!.id, req.params.id ? String(req.params.id) : undefined); res.status(204).send(); },
};
