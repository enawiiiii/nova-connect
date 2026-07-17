import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import { callService } from '../services/call.service.js';

export const callController = {
  async iceServers(req: Request, res: Response) { res.json({ data: callService.iceServers(req.user!.id) }); },
  async list(req: Request, res: Response) { res.json({ data: await callService.list(req.user!.id) }); },
  async start(req: Request, res: Response) { res.status(201).json({ data: await callService.start(req.user!.id, req.body.receiverId ?? null, req.body.callType, req.body.roomId, req.body.participantIds ?? []) }); },
  async finish(req: Request, res: Response) { res.json({ data: await callService.finish(req.user!.id, String(req.params.id), req.body.duration, req.body.status) }); },
  async leaveRoom(req: Request, res: Response) {
    const roomId = String(req.params.roomId);
    const access = await callService.leaveRoom(req.user!.id, roomId);
    const io = req.app.get('io') as Server | undefined;
    if (io && access.mode === 'individual') {
      const ended = { userId: req.user!.id, username: req.user!.username, roomId };
      io.to(`call:${roomId}`).emit('call:ended', ended);
      access.participantUserIds.filter((id) => id !== req.user!.id).forEach((id) => io.to(`user:${id}`).emit('call:ended', ended));
    } else if (io) {
      io.to(`call:${roomId}`).emit('call:participant-left', { userId: req.user!.id });
    }
    res.status(204).send();
  },
};
