import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env, isLocalDevelopment } from '../config/env.js';
import { callService } from '../services/call.service.js';
import { friendService } from '../services/friend.service.js';
import { messageService } from '../services/message.service.js';
import { notificationService } from '../services/notification.service.js';
import { pushService } from '../services/push.service.js';
import { verifyAccessToken, type TokenUser } from '../services/token.service.js';
import { userService } from '../services/user.service.js';

type Ack<T = unknown> = (response: { data?: T; error?: string }) => void;
const activeConnections = new Map<string, number>();
const idSchema = z.string().uuid();
const messageSchema = z.object({ receiverId: idSchema, text: z.string().trim().min(1).max(4000), replyToId: idSchema.nullable().optional() }).strict();
const userTargetSchema = z.object({ receiverId: idSchema }).strict();
const seenSchema = z.object({ senderId: idSchema }).strict();
const callInviteSchema = z.object({ receiverId: idSchema, roomId: idSchema, type: z.enum(['voice', 'video']) }).strict();
const groupInviteSchema = z.object({ receiverIds: z.array(idSchema).min(1).max(7), roomId: idSchema, type: z.enum(['voice', 'video']) }).strict();
const callDeclineSchema = z.object({ callerId: idSchema, roomId: idSchema }).strict();
const callRoomSchema = z.object({ roomId: idSchema }).strict();
const signalSchema = z.object({
  roomId: idSchema,
  targetUserId: idSchema,
  description: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().max(1_000_000).optional(),
  }).strict().optional(),
  candidate: z.object({
    candidate: z.string().max(16_384),
    sdpMid: z.string().max(256).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(65_535).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }).strict().optional(),
}).strict().refine((value) => Boolean(value.description || value.candidate));

interface JoinedCall {
  mode: 'individual' | 'group';
  participantUserIds: string[];
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: isLocalDevelopment ? true : env.CLIENT_URL.split(',').map((value) => value.trim()), credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== 'string') throw new Error('Missing token');
      socket.data.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as TokenUser;
    const userRoom = `user:${user.id}`;
    const joinedCalls = new Map<string, JoinedCall>();
    const rateWindows = new Map<string, { startedAt: number; count: number }>();
    const allowEvent = (name: string, limit: number, windowMs: number) => {
      const now = Date.now();
      const current = rateWindows.get(name);
      if (!current || now - current.startedAt >= windowMs) {
        rateWindows.set(name, { startedAt: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    };
    const leaveCall = async (roomId: string, disconnecting = false) => {
      const membership = joinedCalls.get(roomId);
      if (!membership) return;
      joinedCalls.delete(roomId);
      const room = `call:${roomId}`;
      if (!disconnecting) socket.leave(room);
      const remainingSockets = (await io.in(room).fetchSockets()).filter((peer) => peer.id !== socket.id);
      if (remainingSockets.some((peer) => (peer.data.user as TokenUser).id === user.id)) return;

      if (membership.mode === 'individual') {
        await callService.leaveRoom(user.id, roomId).catch((error) => console.error('Could not persist ended call', error));
        const ended = { userId: user.id, username: user.username, roomId };
        io.to(room).emit('call:ended', ended);
        membership.participantUserIds.filter((id) => id !== user.id).forEach((id) => io.to(`user:${id}`).emit('call:ended', ended));
      } else {
        io.to(room).emit('call:participant-left', { userId: user.id });
      }
    };
    socket.join(userRoom);
    activeConnections.set(user.id, (activeConnections.get(user.id) ?? 0) + 1);
    void (async () => {
      await userService.setPresence(user.id, 'online');
      const onlineFriends = await friendService.list(user.id);
      onlineFriends.forEach((friend) => io.to(`user:${friend.id}`).emit('presence:update', { userId: user.id, status: 'online' }));
    })().catch((error) => console.error('Could not update connected presence', error));

    socket.on('message:send', async (payload: unknown, ack?: Ack) => {
      try {
        if (!allowEvent('message:send', 30, 10_000)) throw new Error('Too many messages. Please slow down.');
        const parsed = messageSchema.parse(payload);
        const message = await messageService.send(user.id, parsed.receiverId, parsed.text, parsed.replyToId);
        io.to(`user:${parsed.receiverId}`).emit('message:new', message);
        socket.emit('message:new', message);
        ack?.({ data: message });
        try {
          const notification = await notificationService.create(parsed.receiverId, 'message', `${user.username} sent you a message`);
          io.to(`user:${parsed.receiverId}`).emit('notification:new', notification);
        } catch (error) { console.error('Could not create message notification', error); }
        void pushService.send(parsed.receiverId, {
          title: user.username,
          body: parsed.text.length > 100 ? `${parsed.text.slice(0, 100)}…` : parsed.text,
          url: `/app/chats/${user.id}`,
          tag: `message-${user.id}`,
          kind: 'message',
        });
      } catch (error) { ack?.({ error: error instanceof Error ? error.message : 'Could not send message' }); }
    });

    socket.on('message:seen', async (payload: unknown) => {
      try {
        if (!allowEvent('message:seen', 60, 10_000)) return;
        const parsed = seenSchema.parse(payload);
        if (!await friendService.areFriends(user.id, parsed.senderId)) return;
        const messageIds = await messageService.markSeen(user.id, parsed.senderId);
        io.to(`user:${parsed.senderId}`).emit('message:seen', { byUserId: user.id, messageIds });
      } catch { /* Ignore stale seen receipts. */ }
    });

    socket.on('typing:start', async (payload: unknown) => {
      const parsed = userTargetSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('typing', 30, 10_000)) return;
      if (await friendService.areFriends(user.id, parsed.data.receiverId)) io.to(`user:${parsed.data.receiverId}`).emit('typing:update', { userId: user.id, typing: true });
    });
    socket.on('typing:stop', async (payload: unknown) => {
      const parsed = userTargetSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('typing', 30, 10_000)) return;
      if (await friendService.areFriends(user.id, parsed.data.receiverId)) io.to(`user:${parsed.data.receiverId}`).emit('typing:update', { userId: user.id, typing: false });
    });

    socket.on('call:invite', async (payload: unknown) => {
      const parsed = callInviteSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('call:invite', 10, 60_000)) return;
      try {
        const access = await callService.roomAccess(user.id, parsed.data.roomId);
        if (access.mode === 'individual' && access.participantUserIds.includes(parsed.data.receiverId)) {
          const caller = await userService.getPublicById(user.id);
          io.to(`user:${parsed.data.receiverId}`).emit('call:incoming', { caller, roomId: parsed.data.roomId, type: parsed.data.type, group: false });
          void pushService.send(parsed.data.receiverId, {
            title: `مكالمة ${parsed.data.type === 'video' ? 'فيديو' : 'صوتية'} من ${user.username}`,
            body: 'اضغط لفتح المكالمة في NOVA',
            url: `/app/call/${parsed.data.type}/${parsed.data.roomId}?mode=individual`,
            tag: `call-${parsed.data.roomId}`,
            kind: 'call',
          });
        }
      } catch { /* Do not reveal call authorization details over sockets. */ }
    });

    socket.on('call:invite-group', async (payload: unknown) => {
      const parsed = groupInviteSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('call:invite', 10, 60_000)) return;
      try {
        const access = await callService.roomAccess(user.id, parsed.data.roomId);
        if (access.mode !== 'group') return;
        const caller = await userService.getPublicById(user.id);
        const receiverIds = [...new Set(parsed.data.receiverIds)].filter((id) => id !== user.id && access.participantUserIds.includes(id));
        receiverIds.forEach((id) => io.to(`user:${id}`).emit('call:incoming', { caller, roomId: parsed.data.roomId, type: parsed.data.type, group: true }));
        receiverIds.forEach((id) => {
          void pushService.send(id, {
            title: `مكالمة جماعية من ${user.username}`,
            body: `دعوة إلى مكالمة ${parsed.data.type === 'video' ? 'فيديو' : 'صوتية'} جماعية`,
            url: `/app/call/${parsed.data.type}/${parsed.data.roomId}?mode=group`,
            tag: `call-${parsed.data.roomId}`,
            kind: 'call',
          });
        });
      } catch { /* Do not reveal call authorization details over sockets. */ }
    });

    socket.on('call:decline', async (payload: unknown) => {
      const parsed = callDeclineSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('call:decline', 10, 60_000)) return;
      try {
        const access = await callService.roomAccess(user.id, parsed.data.roomId);
        if (!access.participantUserIds.includes(parsed.data.callerId)) return;
        if (access.mode === 'individual') await callService.declineRoom(user.id, parsed.data.roomId);
        io.to(`user:${parsed.data.callerId}`).emit('call:declined', { userId: user.id, username: user.username, roomId: parsed.data.roomId });
      } catch { /* Do not reveal call authorization details over sockets. */ }
    });

    socket.on('call:join', async (payload: unknown, ack?: Ack) => {
      try {
        if (!allowEvent('call:join', 12, 60_000)) throw new Error('Too many call join attempts');
        const parsed = callRoomSchema.parse(payload);
        const access = await callService.joinRoom(user.id, parsed.roomId);
        if (access.mode === 'individual' && ['ended', 'declined', 'missed'].includes(access.status)) throw new Error('This call has already ended');
        const room = `call:${parsed.roomId}`;
        const sockets = await io.in(room).fetchSockets();
        const participants = [...new Set(sockets.map((peer) => (peer.data.user as TokenUser).id))];
        const limit = access.mode === 'group' ? 8 : 2;
        if (!participants.includes(user.id) && participants.length >= limit) throw new Error(`This call has reached its ${limit}-person limit`);
        joinedCalls.set(parsed.roomId, { mode: access.mode, participantUserIds: access.participantUserIds });
        socket.join(room);
        socket.to(room).emit('call:participant-joined', { user });
        ack?.({ data: { participants } });
      } catch (error) {
        ack?.({ error: error instanceof Error ? error.message : 'Could not join call' });
      }
    });

    socket.on('webrtc:signal', async (payload: unknown) => {
      const parsed = signalSchema.safeParse(payload);
      if (!parsed.success || !allowEvent('webrtc:signal', 500, 10_000)) return;
      if (!joinedCalls.has(parsed.data.roomId) || !socket.rooms.has(`call:${parsed.data.roomId}`)) return;
      const targets = await io.in(`user:${parsed.data.targetUserId}`).fetchSockets();
      if (!targets.some((target) => target.rooms.has(`call:${parsed.data.roomId}`))) return;
      io.to(`user:${parsed.data.targetUserId}`).emit('webrtc:signal', { ...parsed.data, fromUserId: user.id, fromUsername: user.username });
    });

    socket.on('call:leave', (payload: unknown) => {
      const parsed = callRoomSchema.safeParse(payload);
      if (parsed.success) void leaveCall(parsed.data.roomId);
    });

    socket.on('disconnecting', () => {
      joinedCalls.forEach((_membership, roomId) => { void leaveCall(roomId, true); });
    });

    socket.on('disconnect', async () => {
      const remaining = Math.max((activeConnections.get(user.id) ?? 1) - 1, 0);
      if (remaining > 0) return void activeConnections.set(user.id, remaining);
      activeConnections.delete(user.id);
      const lastSeen = new Date().toISOString();
      await userService.setPresence(user.id, 'offline', lastSeen);
      const friends = await friendService.list(user.id);
      friends.forEach((friend) => io.to(`user:${friend.id}`).emit('presence:update', { userId: user.id, status: 'offline', lastSeen }));
    });
  });
  return io;
}
