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
  }, 30_000);
});
