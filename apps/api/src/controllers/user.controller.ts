import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';

export const userController = {
  async me(req: Request, res: Response) { res.json({ data: await userService.getById(req.user!.id) }); },
  async search(req: Request, res: Response) { res.json({ data: await userService.search(String(req.query.q ?? ''), req.user!.id) }); },
  async update(req: Request, res: Response) { res.json({ data: await userService.update(req.user!.id, req.body) }); },
  async avatar(req: Request, res: Response) { res.json({ data: await userService.uploadAvatar(req.user!.id, req.file) }); },
  async accountControls(req: Request, res: Response) { res.json({ data: await userService.accountControls(req.user!.id) }); },
  async updateAccountControls(req: Request, res: Response) { res.json({ data: await userService.updateAccountControls(req.user!.id, req.body) }); },
  async exportAccount(req: Request, res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="nova-account-${req.user!.id}.json"`);
    res.json({ data: await userService.exportAccount(req.user!.id) });
  },
  async deleteAccount(req: Request, res: Response) {
    await userService.deleteAccount(req.user!.id, req.body.password);
    res.clearCookie('refresh_token');
    res.status(204).send();
  },
};
