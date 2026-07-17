import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';

export const userController = {
  async me(req: Request, res: Response) { res.json({ data: await userService.getById(req.user!.id) }); },
  async search(req: Request, res: Response) { res.json({ data: await userService.search(String(req.query.q ?? ''), req.user!.id) }); },
  async update(req: Request, res: Response) { res.json({ data: await userService.update(req.user!.id, req.body) }); },
  async avatar(req: Request, res: Response) { res.json({ data: await userService.uploadAvatar(req.user!.id, req.file) }); },
};
