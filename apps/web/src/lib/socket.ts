import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
const SOCKET_URL = import.meta.env.DEV
  ? window.location.origin
  : (import.meta.env.VITE_SOCKET_URL ?? window.location.origin);

export function connectSocket(token: string) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['polling', 'websocket'],
    tryAllTransports: true,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function updateSocketToken(token: string) {
  if (!socket) return;
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function getSocket() { return socket; }
export function disconnectSocket() { socket?.disconnect(); socket = null; }
