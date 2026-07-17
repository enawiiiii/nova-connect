import type { Request, Response } from 'express';
import { friendService } from '../services/friend.service.js';

export const friendController = {
  async list(req: Request, res: Response) { res.json({ data: await friendService.list(req.user!.id) }); },
  async requests(req: Request, res: Response) { res.json({ data: await friendService.requests(req.user!.id) }); },
  async send(req: Request, res: Response) { res.status(201).json({ data: await friendService.send(req.user!.id, req.body.receiverId, req.user!.username) }); },
  async respond(req: Request, res: Response) { await friendService.respond(req.user!.id, String(req.params.id), req.body.action, req.user!.username); res.status(204).send(); },
  async remove(req: Request, res: Response) { await friendService.remove(req.user!.id, String(req.params.id)); res.status(204).send(); },
};
