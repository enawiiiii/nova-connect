import crypto from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import request from 'supertest';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.LOCAL_DEVELOPMENT_MODE = 'true';
process.env.LOCAL_DATA_PATH = `.local/vitest-realtime-${process.pid}.json`;
process.env.BCRYPT_ROUNDS = '10';

let app: Express;
let server: HttpServer;
let baseUrl: string;
let closeSockets: (() => Promise<void>) | undefined;
const suffix = `${process.pid}${Date.now().toString(36)}`;

async function createVerifiedAccount(username: string) {
  const agent = request.agent(server);
  const email = `${username.toLowerCase()}.${suffix}@example.com`;
  const registration = await agent.post('/api/v1/auth/register').send({ username, email, password: 'StrongPass123' });
  expect(registration.status).toBe(201);
  const token = new URL(registration.body.data.verificationUrl as string, 'http://localhost').searchParams.get('token');
  expect((await agent.post('/api/v1/auth/verify-email').send({ token })).status).toBe(200);
  const login = await agent.post('/api/v1/auth/login').send({ email, password: 'StrongPass123' });
  expect(login.status).toBe(200);
  return {
    agent,
    id: login.body.data.user.id as string,
    username,
    email,
    accessToken: login.body.data.accessToken as string,
  };
}

function connectedClient(token: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createClient(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

beforeAll(async () => {
  ({ app } = await import('../app.js'));
  const { createSocketServer } = await import('../socket/index.js');
  server = createServer(app);
  const io = createSocketServer(server);
  app.set('io', io);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeSockets = async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  };
});

afterAll(async () => {
  await closeSockets?.();
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('authenticated realtime flow', () => {
  it('keeps private fields private and completes friendship, messaging, and individual calling', async () => {
    const first = await createVerifiedAccount(`First_${suffix}`);
    const second = await createVerifiedAccount(`Second_${suffix}`);
    const third = await createVerifiedAccount(`Third_${suffix}`);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const search = await first.agent.get(`/api/v1/users/search?q=${encodeURIComponent(second.username)}`).set(auth(first.accessToken));
    expect(search.status).toBe(200);
    expect(search.body.data[0]).toMatchObject({ id: second.id, username: second.username });
    expect(search.body.data[0].email).toBeUndefined();

    const sentRequest = await first.agent.post('/api/v1/friends/requests').set(auth(first.accessToken)).send({ receiverId: second.id });
    expect(sentRequest.status).toBe(201);
    const incomingRequests = await second.agent.get('/api/v1/friends/requests').set(auth(second.accessToken));
    expect(incomingRequests.status).toBe(200);
    expect(incomingRequests.body.data[0].user.email).toBeUndefined();
    expect((await second.agent.patch(`/api/v1/friends/requests/${incomingRequests.body.data[0].id}`).set(auth(second.accessToken)).send({ action: 'accept' })).status).toBe(204);

    const friends = await first.agent.get('/api/v1/friends').set(auth(first.accessToken));
    expect(friends.status).toBe(200);
    expect(friends.body.data[0]).toMatchObject({ id: second.id });
    expect(friends.body.data[0].email).toBeUndefined();

    const thirdRequest = await second.agent.post('/api/v1/friends/requests').set(auth(second.accessToken)).send({ receiverId: third.id });
    expect(thirdRequest.status).toBe(201);
    const thirdIncomingRequests = await third.agent.get('/api/v1/friends/requests').set(auth(third.accessToken));
    expect((await third.agent.patch(`/api/v1/friends/requests/${thirdIncomingRequests.body.data[0].id}`).set(auth(third.accessToken)).send({ action: 'accept' })).status).toBe(204);

    const report = await first.agent.post('/api/v1/privacy/reports').set(auth(first.accessToken)).send({ userId: second.id, reason: 'harassment', details: 'Automated report flow check' });
    expect(report.status).toBe(201);
    expect(report.body.data.report).toMatchObject({ status: 'open' });
    const { localDb } = await import('../database/local.database.js');
    await localDb.mutate((state) => { const admin = state.users.find((item) => item.id === first.id); if (admin) admin.is_admin = true; });
    const adminReports = await first.agent.get('/api/v1/admin/reports').set(auth(first.accessToken));
    expect(adminReports.status).toBe(200);
    expect(adminReports.body.data.items.some((item: { id: string }) => item.id === report.body.data.report.id)).toBe(true);
    expect(adminReports.body.data.summary.open).toBeGreaterThan(0);

    const firstSocket = await connectedClient(first.accessToken);
    const secondSocket = await connectedClient(second.accessToken);
    try {
      const receivedMessage = new Promise<Record<string, unknown>>((resolve) => secondSocket.once('message:new', resolve));
      const messageAck = await firstSocket.timeout(5_000).emitWithAck('message:send', { receiverId: second.id, text: 'Realtime works' }) as { data?: Record<string, unknown>; error?: string };
      expect(messageAck.error).toBeUndefined();
      expect(messageAck.data?.messageText).toBe('Realtime works');
      expect((await receivedMessage).messageText).toBe('Realtime works');

      const roomId = crypto.randomUUID();
      const call = await first.agent.post('/api/v1/calls').set(auth(first.accessToken)).send({ receiverId: second.id, participantIds: [], callType: 'voice', roomId });
      expect(call.status).toBe(201);

      const externalCaller = await third.agent.post('/api/v1/calls').set(auth(third.accessToken)).send({
        receiverId: second.id,
        participantIds: [],
        callType: 'video',
        roomId: crypto.randomUUID(),
      });
      expect(externalCaller.status).toBe(409);
      expect(externalCaller.body.error.code).toBe('USER_BUSY');

      const alreadyCalling = await second.agent.post('/api/v1/calls').set(auth(second.accessToken)).send({
        receiverId: third.id,
        participantIds: [],
        callType: 'voice',
        roomId: crypto.randomUUID(),
      });
      expect(alreadyCalling.status).toBe(409);
      expect(alreadyCalling.body.error.code).toBe('CALLER_BUSY');

      const incomingCall = new Promise<{ caller: Record<string, unknown>; roomId: string }>((resolve) => secondSocket.once('call:incoming', resolve));
      firstSocket.emit('call:invite', { receiverId: second.id, roomId, type: 'voice' });
      const incoming = await incomingCall;
      expect(incoming.roomId).toBe(roomId);
      expect(incoming.caller).toMatchObject({ id: first.id, username: first.username });
      expect(incoming.caller.email).toBeUndefined();

      const firstJoin = await firstSocket.timeout(5_000).emitWithAck('call:join', { roomId }) as { data?: { participants: string[] }; error?: string };
      expect(firstJoin.error).toBeUndefined();
      const secondJoin = await secondSocket.timeout(5_000).emitWithAck('call:join', { roomId }) as { data?: { participants: string[] }; error?: string };
      expect(secondJoin.error).toBeUndefined();
      expect(secondJoin.data?.participants).toContain(first.id);

      const answered = await first.agent.get('/api/v1/calls').set(auth(first.accessToken));
      expect(answered.body.data.find((item: { id: string }) => item.id === call.body.data.id).status).toBe('answered');

      const endedEvent = new Promise<{ roomId: string }>((resolve) => firstSocket.once('call:ended', resolve));
      secondSocket.emit('call:leave', { roomId });
      expect((await endedEvent).roomId).toBe(roomId);
      const ended = await first.agent.get('/api/v1/calls').set(auth(first.accessToken));
      expect(ended.body.data.find((item: { id: string }) => item.id === call.body.data.id).status).toBe('ended');
    } finally {
      firstSocket.disconnect();
      secondSocket.disconnect();
    }

    const reportId = report.body.data.report.id as string;
    const detail = await first.agent.get(`/api/v1/admin/reports/${reportId}`).set(auth(first.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: reportId,
      reporter: { id: first.id, username: first.username },
      reported: { id: second.id, username: second.username },
      status: 'open',
    });

    const reviewing = await first.agent.patch(`/api/v1/admin/reports/${reportId}`).set(auth(first.accessToken)).send({
      status: 'reviewing',
      action: 'warn',
      note: 'Reviewed in the automated moderation flow.',
    });
    expect(reviewing.status).toBe(200);
    expect(reviewing.body.data.status).toBe('reviewing');
    expect(reviewing.body.data.history[0]).toMatchObject({ action: 'warn', note: 'Reviewed in the automated moderation flow.' });
    const warnings = await second.agent.get('/api/v1/notifications').set(auth(second.accessToken));
    expect(warnings.body.data.some((item: { type: string; content: string }) => item.type === 'system' && item.content.includes('تنبيه'))).toBe(true);

    const suspended = await first.agent.patch(`/api/v1/admin/reports/${reportId}`).set(auth(first.accessToken)).send({
      status: 'resolved',
      action: 'suspend_24h',
      note: 'Confirmed violation; temporary suspension applied.',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.accountModeration.suspendedUntil).toBeTruthy();
    const blockedActiveSession = await second.agent.get('/api/v1/notifications').set(auth(second.accessToken));
    expect(blockedActiveSession.status).toBe(403);
    expect(blockedActiveSession.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const blockedLogin = await second.agent.post('/api/v1/auth/login').send({ email: second.email, password: 'StrongPass123' });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const restored = await first.agent.patch(`/api/v1/admin/reports/${reportId}`).set(auth(first.accessToken)).send({
      status: 'resolved',
      action: 'restore_account',
      note: 'Account restored after administrative review.',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.accountModeration.suspendedUntil).toBeNull();
    expect((await second.agent.post('/api/v1/auth/login').send({ email: second.email, password: 'StrongPass123' })).status).toBe(200);
  }, 30_000);
});
