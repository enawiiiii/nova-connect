import { db } from '../database/supabase.js';
import crypto from 'node:crypto';
import { isLocalDevelopment } from '../config/env.js';
import { localDb, type LocalMessage } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapMessage } from '../utils/mappers.js';
import { friendService } from './friend.service.js';
import { privacyService } from './privacy.service.js';

const messageSelect = '*,message_reactions(user_id,emoji)';

function localMessageRow(message: LocalMessage) {
  return { ...message, reactions: message.reactions ?? [] } as unknown as Record<string, unknown>;
}

function hasBytes(buffer: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function fileContentMatchesMime(file: Express.Multer.File) {
  const { buffer, mimetype } = file;
  if (mimetype === 'image/jpeg') return hasBytes(buffer, [0xff, 0xd8, 0xff]);
  if (mimetype === 'image/png') return hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimetype === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (mimetype === 'application/pdf') return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (mimetype === 'audio/webm') return hasBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mimetype === 'audio/mp4') return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mimetype === 'audio/mpeg') return buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0);
  return false;
}

async function mapPrivateMessage(row: Record<string, unknown>) {
  const message = mapMessage(row);
  if (!message.attachmentUrl || message.deletedAt) return message;
  const { data, error } = await db.storage.from('message-media').createSignedUrl(message.attachmentUrl, 60 * 60);
  return { ...message, attachmentUrl: error ? null : data.signedUrl };
}

export const messageService = {
  async conversation(userId: string, otherUserId: string, before?: string) {
    if (await privacyService.isBlocked(userId, otherUserId)) throw new AppError(403, 'Conversation is blocked', 'USER_BLOCKED');
    if (!(await friendService.areFriends(userId, otherUserId))) throw new AppError(403, 'Messaging is limited to friends', 'NOT_FRIENDS');
    if (isLocalDevelopment) return localDb.read((state) => state.messages.filter((message) => ((message.sender_id === userId && message.receiver_id === otherUserId) || (message.sender_id === otherUserId && message.receiver_id === userId)) && (!before || message.created_at < before)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-50).map((message) => mapMessage(localMessageRow(message))));
    let query = db.from('messages').select(messageSelect).or(`and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`).order('created_at', { ascending: false }).limit(50);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) throw new AppError(500, 'Could not load messages');
    return Promise.all((data ?? []).reverse().map((row) => mapPrivateMessage(row)));
  },

  async send(senderId: string, receiverId: string, messageText: string, replyToId?: string | null) {
    if (await privacyService.isBlocked(senderId, receiverId)) throw new AppError(403, 'Messaging is blocked', 'USER_BLOCKED');
    if (!(await friendService.areFriends(senderId, receiverId))) throw new AppError(403, 'Messaging is limited to friends', 'NOT_FRIENDS');
    if (replyToId) {
      const replyExists = isLocalDevelopment
        ? await localDb.read((state) => state.messages.some((message) => message.id === replyToId && [senderId, receiverId].includes(message.sender_id) && [senderId, receiverId].includes(message.receiver_id)))
        : Boolean((await db.from('messages').select('id').eq('id', replyToId).or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`).maybeSingle()).data);
      if (!replyExists) throw new AppError(422, 'Reply target is not in this conversation', 'INVALID_REPLY_TARGET');
    }
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const message: LocalMessage = { id: crypto.randomUUID(), sender_id: senderId, receiver_id: receiverId, message_text: messageText.trim(), message_type: 'text', attachment_url: null, attachment_name: null, reply_to_id: replyToId ?? null, edited_at: null, deleted_at: null, reactions: [], status: 'sent', created_at: new Date().toISOString() };
      state.messages.push(message);
      return mapMessage(localMessageRow(message));
    });
    const { data, error } = await db.from('messages').insert({ sender_id: senderId, receiver_id: receiverId, message_text: messageText.trim(), reply_to_id: replyToId ?? null }).select(messageSelect).single();
    if (error || !data) throw new AppError(500, 'Could not send message');
    return mapMessage(data);
  },

  async sendAttachment(senderId: string, receiverId: string, file: Express.Multer.File | undefined, caption = '', replyToId?: string | null) {
    if (await privacyService.isBlocked(senderId, receiverId)) throw new AppError(403, 'Messaging is blocked', 'USER_BLOCKED');
    if (!file) throw new AppError(422, 'Choose a file to send', 'FILE_REQUIRED');
    if (!fileContentMatchesMime(file)) throw new AppError(422, 'File contents do not match the selected file type', 'INVALID_FILE_CONTENT');
    if (!(await friendService.areFriends(senderId, receiverId))) throw new AppError(403, 'Messaging is limited to friends', 'NOT_FRIENDS');
    if (replyToId) {
      const replyExists = isLocalDevelopment
        ? await localDb.read((state) => state.messages.some((message) => message.id === replyToId && [senderId, receiverId].includes(message.sender_id) && [senderId, receiverId].includes(message.receiver_id)))
        : Boolean((await db.from('messages').select('id').eq('id', replyToId).or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`).maybeSingle()).data);
      if (!replyExists) throw new AppError(422, 'Reply target is not in this conversation', 'INVALID_REPLY_TARGET');
    }
    const image = file.mimetype.startsWith('image/');
    const audio = file.mimetype.startsWith('audio/');
    const messageType = image ? 'image' : audio ? 'audio' : 'file';
    let attachmentUrl: string;
    if (isLocalDevelopment) {
      attachmentUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    } else {
      const extension = file.originalname.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || (image ? 'webp' : audio ? 'webm' : 'bin');
      const path = `${senderId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
      const { error } = await db.storage.from('message-media').upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) throw new AppError(500, 'Could not upload attachment', 'ATTACHMENT_UPLOAD_FAILED');
      attachmentUrl = path;
    }
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const message: LocalMessage = {
        id: crypto.randomUUID(), sender_id: senderId, receiver_id: receiverId, message_text: caption.trim(), message_type: messageType,
        attachment_url: attachmentUrl, attachment_name: file.originalname.slice(0, 255), reply_to_id: replyToId ?? null, edited_at: null, deleted_at: null, reactions: [],
        status: 'sent', created_at: new Date().toISOString(),
      };
      state.messages.push(message);
      return mapMessage(localMessageRow(message));
    });
    const { data, error } = await db.from('messages').insert({
      sender_id: senderId, receiver_id: receiverId, message_text: caption.trim(), message_type: messageType,
      attachment_url: attachmentUrl, attachment_name: file.originalname.slice(0, 255), reply_to_id: replyToId ?? null,
    }).select(messageSelect).single();
    if (error || !data) throw new AppError(500, 'Could not send attachment', 'ATTACHMENT_SEND_FAILED');
    return mapPrivateMessage(data);
  },

  async edit(userId: string, messageId: string, text: string) {
    const editedAt = new Date().toISOString();
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const message = state.messages.find((item) => item.id === messageId && item.sender_id === userId && !item.deleted_at);
      if (!message) throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
      message.message_text = text.trim();
      message.edited_at = editedAt;
      return { message: mapMessage(localMessageRow(message)), otherUserId: message.receiver_id };
    });
    const { data, error } = await db.from('messages').update({ message_text: text.trim(), edited_at: editedAt }).eq('id', messageId).eq('sender_id', userId).is('deleted_at', null).select(messageSelect).maybeSingle();
    if (error || !data) throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    return { message: await mapPrivateMessage(data), otherUserId: String(data.receiver_id) };
  },

  async remove(userId: string, messageId: string) {
    const deletedAt = new Date().toISOString();
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const message = state.messages.find((item) => item.id === messageId && item.sender_id === userId);
      if (!message) throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
      message.deleted_at = deletedAt;
      message.message_text = '';
      message.attachment_url = null;
      return { message: mapMessage(localMessageRow(message)), otherUserId: message.receiver_id };
    });
    const { data: existing } = await db.from('messages').select('attachment_url').eq('id', messageId).eq('sender_id', userId).maybeSingle();
    const { data, error } = await db.from('messages').update({ message_text: '', attachment_url: null, deleted_at: deletedAt }).eq('id', messageId).eq('sender_id', userId).select(messageSelect).maybeSingle();
    if (error || !data) throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    if (existing?.attachment_url) await db.storage.from('message-media').remove([existing.attachment_url]);
    return { message: mapMessage(data), otherUserId: String(data.receiver_id) };
  },

  async react(userId: string, messageId: string, emoji: string) {
    const source = isLocalDevelopment
      ? await localDb.read((state) => state.messages.find((item) => item.id === messageId))
      : (await db.from('messages').select('sender_id,receiver_id').eq('id', messageId).maybeSingle()).data;
    if (!source || ![source.sender_id, source.receiver_id].includes(userId)) throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    if (isLocalDevelopment) {
      return localDb.mutate((state) => {
        const message = state.messages.find((item) => item.id === messageId)!;
        message.reactions ??= [];
        const index = message.reactions.findIndex((item) => item.user_id === userId && item.emoji === emoji);
        if (index >= 0) message.reactions.splice(index, 1);
        else message.reactions.push({ user_id: userId, emoji });
        const otherUserId = message.sender_id === userId ? message.receiver_id : message.sender_id;
        return { message: mapMessage(localMessageRow(message)), otherUserId };
      });
    }
    const existing = await db.from('message_reactions').select('message_id').eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
    if (existing.data) await db.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
    else await db.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    const { data } = await db.from('messages').select(messageSelect).eq('id', messageId).single();
    const otherUserId = source.sender_id === userId ? source.receiver_id : source.sender_id;
    return { message: await mapPrivateMessage(data!), otherUserId: String(otherUserId) };
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
