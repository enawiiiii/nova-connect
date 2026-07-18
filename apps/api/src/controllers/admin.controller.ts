import type { Request, Response } from 'express';
import { monitoringService } from '../services/monitoring.service.js';

export const adminController = {
  async overview(_req: Request, res: Response) { res.json({ data: await monitoringService.overview() }); },
  async reports(_req: Request, res: Response) { res.json({ data: await monitoringService.reports() }); },
  async updateReport(req: Request, res: Response) { res.json({ data: await monitoringService.updateReport(String(req.params.id), req.body.status) }); },
  async errors(_req: Request, res: Response) { res.json({ data: await monitoringService.errors() }); },
  async clientError(req: Request, res: Response) {
    await monitoringService.record({ userId: req.user!.id, source: 'web-client', message: req.body.message, details: req.body.details, path: req.body.path, userAgent: req.get('user-agent') });
    res.status(204).send();
  },
};
