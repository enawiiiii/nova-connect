import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import { groupService } from '../services/group.service.js';
import { pushService } from '../services/push.service.js';

export const groupController = {
  async list(req: Request, res: Response) { res.json({ data: await groupService.list(req.user!.id) }); },
  async create(req: Request, res: Response) {
    const group = await groupService.create(req.user!.id, req.body.name, req.body.memberIds);
    res.status(201).json({ data: group });
  },
  async messages(req: Request, res: Response) { res.json({ data: await groupService.messages(req.user!.id, String(req.params.id)) }); },
  async send(req: Request, res: Response) {
    const result = await groupService.send(req.user!.id, String(req.params.id), req.body.text);
    const io = req.app.get('io') as Server | undefined;
    result.group.members.forEach((member) => io?.to(`user:${member.id}`).emit('group:message', result.message));
    result.group.members.filter((member) => member.id !== req.user!.id).forEach((member) => {
      void pushService.send(member.id, {
        title: result.group.name,
        body: `${req.user!.username}: ${req.body.text}`,
        url: `/app/groups/${result.group.id}`,
        tag: `group-${result.group.id}`,
        kind: 'message',
      });
    });
    res.status(201).json({ data: result.message });
  },
  async members(req: Request, res: Response) {
    res.json({ data: await groupService.updateMembers(req.user!.id, String(req.params.id), req.body.addIds, req.body.removeIds) });
  },
};
