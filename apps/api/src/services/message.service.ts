import { db } from '../database/supabase.js';
import crypto from 'node:crypto';
import { isLocalDevelopment } from '../config/env.js';
import { localDb, type LocalMessage } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapMessage } from '../utils/mappers.js';
import { friendService } from './friend.service.js';

export const messageService = {
  async conversation(userId: string, otherUserId: string, before?: string) {
    if (!(await friendService.areFriends(userId, otherUserId))) throw new AppError(403, 'Messaging is limited to friends', 'NOT_FRIENDS');
    if (isLocalDevelopment) return localDb.read((state) => state.messages.filter((message) => ((message.sender_id === userId && message.receiver_id === otherUserId) || (message.sender_id === otherUserId && message.receiver_id === userId)) && (!before || message.created_at < before)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-50).map((message) => mapMessage(message as unknown as Record<string, unknown>)));
    let query = db.from('messages').select('*').or(`and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`).order('created_at', { ascending: false }).limit(50);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) throw new AppError(500, 'Could not load messages');
    return (data ?? []).reverse().map(mapMessage);
  },

  async send(senderId: string, receiverId: string, messageText: string) {
    if (!(await friendService.areFriends(senderId, receiverId))) throw new AppError(403, 'Messaging is limited to friends', 'NOT_FRIENDS');
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const message: LocalMessage = { id: crypto.randomUUID(), sender_id: senderId, receiver_id: receiverId, message_text: messageText.trim(), status: 'sent', created_at: new Date().toISOString() };
      state.messages.push(message);
      return mapMessage(message as unknown as Record<string, unknown>);
    });
    const { data, error } = await db.from('messages').insert({ sender_id: senderId, receiver_id: receiverId, message_text: messageText.trim() }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not send message');
    return mapMessage(data);
  },

  async markSeen(userId: string, senderId: string) {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const updated = state.messages.filter((message) => message.receiver_id === userId && message.sender_id === senderId && message.status !== 'seen');
      updated.forEach((message) => { message.status = 'seen'; });
      return updated.map((message) => message.id);
    });
    const { data, error } = await db.from('messages').update({ status: 'seen' }).eq('receiver_id', userId).eq('sender_id', senderId).neq('status', 'seen').select('id');
    if (error) throw new AppError(500, 'Could not mark messages as seen');
    return (data ?? []).map((row) => row.id);
  },
};
