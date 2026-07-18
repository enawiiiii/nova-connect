import type { AppNotification, CallRecord, Message, PublicUser } from '@nova/shared';

type Row = Record<string, unknown>;

export const mapUser = (row: Row, includeEmail = false): PublicUser => ({
  id: String(row.id),
  username: String(row.username),
  ...(includeEmail && row.email ? { email: String(row.email) } : {}),
  avatar: !includeEmail && row.show_avatar === false ? null : row.avatar ? String(row.avatar) : null,
  bio: row.bio ? String(row.bio) : null,
  status: (row.status ?? 'offline') as PublicUser['status'],
  lastSeen: !includeEmail && row.show_last_seen === false ? null : row.last_seen ? String(row.last_seen) : null,
});

export const mapMessage = (row: Row): Message => ({
  id: String(row.id),
  senderId: String(row.sender_id),
  receiverId: String(row.receiver_id),
  messageText: row.deleted_at ? '' : String(row.message_text ?? ''),
  messageType: (row.message_type ?? 'text') as Message['messageType'],
  attachmentUrl: row.deleted_at || !row.attachment_url ? null : String(row.attachment_url),
  attachmentName: row.deleted_at || !row.attachment_name ? null : String(row.attachment_name),
  replyToId: row.reply_to_id ? String(row.reply_to_id) : null,
  editedAt: row.edited_at ? String(row.edited_at) : null,
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  reactions: (() => {
    const source = Array.isArray(row.message_reactions) ? row.message_reactions : Array.isArray(row.reactions) ? row.reactions : [];
    const grouped = new Map<string, string[]>();
    source.forEach((reaction) => {
      if (!reaction || typeof reaction !== 'object') return;
      const item = reaction as Record<string, unknown>;
      const emoji = String(item.emoji ?? '');
      const userId = String(item.user_id ?? '');
      if (emoji && userId) grouped.set(emoji, [...(grouped.get(emoji) ?? []), userId]);
    });
    return [...grouped].map(([emoji, userIds]) => ({ emoji, userIds }));
  })(),
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
