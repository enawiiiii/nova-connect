import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import { messageService } from '../services/message.service.js';
import { pushService } from '../services/push.service.js';

export const messageController = {
  async conversation(req: Request, res: Response) { res.json({ data: await messageService.conversation(req.user!.id, String(req.params.userId), req.query.before as string | undefined) }); },
  async attachment(req: Request, res: Response) {
    const receiverId = String(req.params.userId);
    const message = await messageService.sendAttachment(req.user!.id, receiverId, req.file, String(req.body.caption ?? ''), req.body.replyToId ? String(req.body.replyToId) : null);
    const io = req.app.get('io') as Server | undefined;
    io?.to(`user:${receiverId}`).emit('message:new', message);
    io?.to(`user:${req.user!.id}`).emit('message:new', message);
    void pushService.send(receiverId, {
      title: req.user!.username,
      body: message.messageType === 'audio' ? 'أرسل رسالة صوتية' : message.messageType === 'image' ? 'أرسل صورة' : 'أرسل ملفًا',
      url: `/app/chats/${req.user!.id}`,
      tag: `message-${req.user!.id}`,
      kind: 'message',
    });
    res.status(201).json({ data: message });
  },
  async edit(req: Request, res: Response) {
    const result = await messageService.edit(req.user!.id, String(req.params.id), req.body.text);
    const io = req.app.get('io') as Server | undefined;
    io?.to(`user:${result.otherUserId}`).emit('message:updated', result.message);
    io?.to(`user:${req.user!.id}`).emit('message:updated', result.message);
    res.json({ data: result.message });
  },
  async remove(req: Request, res: Response) {
    const result = await messageService.remove(req.user!.id, String(req.params.id));
    const io = req.app.get('io') as Server | undefined;
    io?.to(`user:${result.otherUserId}`).emit('message:updated', result.message);
    io?.to(`user:${req.user!.id}`).emit('message:updated', result.message);
    res.json({ data: result.message });
  },
  async react(req: Request, res: Response) {
    const result = await messageService.react(req.user!.id, String(req.params.id), req.body.emoji);
    const io = req.app.get('io') as Server | undefined;
    io?.to(`user:${result.otherUserId}`).emit('message:updated', result.message);
    io?.to(`user:${req.user!.id}`).emit('message:updated', result.message);
    res.json({ data: result.message });
  },
};
