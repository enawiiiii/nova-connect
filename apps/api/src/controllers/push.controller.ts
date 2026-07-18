import type { Request, Response } from 'express';
import { pushService } from '../services/push.service.js';

export const pushController = {
  config(_req: Request, res: Response) {
    res.json({ data: pushService.config() });
  },
  async subscribe(req: Request, res: Response) {
    await pushService.subscribe(req.user!.id, req.body.subscription, req.get('user-agent'));
    res.status(204).send();
  },
  async unsubscribe(req: Request, res: Response) {
    await pushService.unsubscribe(req.user!.id, req.body.endpoint);
    res.status(204).send();
  },
};
