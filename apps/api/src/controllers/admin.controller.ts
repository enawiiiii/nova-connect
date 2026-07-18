import type { Request, Response } from 'express';
import { monitoringService } from '../services/monitoring.service.js';
import { reportModerationService, type ReportReason, type ReportStatus } from '../services/report-moderation.service.js';

export const adminController = {
  async overview(_req: Request, res: Response) { res.json({ data: await monitoringService.overview() }); },
  async reports(req: Request, res: Response) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    res.json({ data: await reportModerationService.list({
      status: typeof req.query.status === 'string' ? req.query.status as ReportStatus : undefined,
      reason: typeof req.query.reason === 'string' ? req.query.reason as ReportReason : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page,
      limit,
    }) });
  },
  async reportDetail(req: Request, res: Response) { res.json({ data: await reportModerationService.detail(String(req.params.id)) }); },
  async updateReport(req: Request, res: Response) { res.json({ data: await reportModerationService.update(String(req.params.id), req.user!.id, req.body) }); },
  async errors(_req: Request, res: Response) { res.json({ data: await monitoringService.errors() }); },
  async clientError(req: Request, res: Response) {
    await monitoringService.record({ userId: req.user!.id, source: 'web-client', message: req.body.message, details: req.body.details, path: req.body.path, userAgent: req.get('user-agent') });
    res.status(204).send();
  },
};
