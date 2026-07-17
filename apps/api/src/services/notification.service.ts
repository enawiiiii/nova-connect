import { db } from '../database/supabase.js';
import crypto from 'node:crypto';
import { isLocalDevelopment } from '../config/env.js';
import { localDb, type LocalNotification } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapNotification } from '../utils/mappers.js';

export const notificationService = {
  async create(userId: string, type: string, content: string) {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const notification: LocalNotification = { id: crypto.randomUUID(), user_id: userId, type: type as LocalNotification['type'], content, read: false, created_at: new Date().toISOString() };
      state.notifications.push(notification);
      return mapNotification(notification as unknown as Record<string, unknown>);
    });
    const { data, error } = await db.from('notifications').insert({ user_id: userId, type, content }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not create notification');
    return mapNotification(data);
  },
  async list(userId: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.notifications.filter((item) => item.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map((item) => mapNotification(item as unknown as Record<string, unknown>)));
    const { data, error } = await db.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) throw new AppError(500, 'Could not load notifications');
    return (data ?? []).map(mapNotification);
  },
  async markRead(userId: string, id?: string) {
    if (isLocalDevelopment) {
      await localDb.mutate((state) => state.notifications.filter((item) => item.user_id === userId && (!id || item.id === id)).forEach((item) => { item.read = true; }));
      return;
    }
    let query = db.from('notifications').update({ read: true }).eq('user_id', userId);
    if (id) query = query.eq('id', id);
    const { error } = await query;
    if (error) throw new AppError(500, 'Could not update notifications');
  },
};
