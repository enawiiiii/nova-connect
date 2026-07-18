import type { Request, Response } from 'express';
import { privacyService } from '../services/privacy.service.js';

export const privacyController = {
  async blocked(req: Request, res: Response) { res.json({ data: await privacyService.list(req.user!.id) }); },
  async block(req: Request, res: Response) { await privacyService.block(req.user!.id, req.body.userId); res.status(204).send(); },
  async unblock(req: Request, res: Response) { await privacyService.unblock(req.user!.id, String(req.params.userId)); res.status(204).send(); },
  async report(req: Request, res: Response) { await privacyService.report(req.user!.id, req.body.userId, req.body.reason, req.body.details); res.status(201).json({ data: { submitted: true } }); },
};
