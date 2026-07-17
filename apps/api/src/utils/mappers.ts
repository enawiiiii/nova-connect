import type { AppNotification, CallRecord, Message, PublicUser } from '@nova/shared';

type Row = Record<string, unknown>;

export const mapUser = (row: Row, includeEmail = false): PublicUser => ({
  id: String(row.id),
  username: String(row.username),
  ...(includeEmail && row.email ? { email: String(row.email) } : {}),
  avatar: row.avatar ? String(row.avatar) : null,
  bio: row.bio ? String(row.bio) : null,
  status: (row.status ?? 'offline') as PublicUser['status'],
  lastSeen: row.last_seen ? String(row.last_seen) : null,
});

export const mapMessage = (row: Row): Message => ({
  id: String(row.id),
  senderId: String(row.sender_id),
  receiverId: String(row.receiver_id),
  messageText: String(row.message_text),
  status: row.status as Message['status'],
  createdAt: String(row.created_at),
});

export const mapCall = (row: Row): CallRecord => ({
  id: String(row.id),
  callerId: String(row.caller_id),
  receiverId: row.receiver_id ? String(row.receiver_id) : null,
  roomId: String(row.room_id),
  callType: row.call_type as CallRecord['callType'],
  duration: Number(row.duration ?? 0),
  status: row.status as CallRecord['status'],
  createdAt: String(row.created_at),
});

export const mapNotification = (row: Row): AppNotification => ({
  id: String(row.id),
  userId: String(row.user_id),
  type: row.type as AppNotification['type'],
  content: String(row.content),
  read: Boolean(row.read),
  createdAt: String(row.created_at),
});
