import sharp from 'sharp';
import { db } from '../database/supabase.js';
import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';

export const userService = {
  async getById(id: string) {
    if (isLocalDevelopment) {
      const user = await localDb.read((state) => state.users.find((item) => item.id === id));
      if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
      return mapUser(user as unknown as Record<string, unknown>, true);
    }
    const { data } = await db.from('users').select('*').eq('id', id).maybeSingle();
    if (!data) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return mapUser(data, true);
  },

  async getPublicById(id: string) {
    if (isLocalDevelopment) {
      const user = await localDb.read((state) => state.users.find((item) => item.id === id));
      if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
      return mapUser(user as unknown as Record<string, unknown>);
    }
    const { data } = await db.from('users').select('id,username,avatar,bio,status,last_seen').eq('id', id).maybeSingle();
    if (!data) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return mapUser(data);
  },

  async search(query: string, currentUserId: string) {
    const safe = query.trim().slice(0, 50);
    if (safe.length < 2) return [];
    if (isLocalDevelopment) return localDb.read((state) => state.users.filter((user) => user.id !== currentUserId && user.username.toLowerCase().includes(safe.toLowerCase())).slice(0, 20).map((user) => mapUser(user as unknown as Record<string, unknown>)));
    const { data, error } = await db.from('users').select('id,username,avatar,bio,status,last_seen').neq('id', currentUserId).ilike('username', `%${safe}%`).limit(20);
    if (error) throw new AppError(500, 'Could not search users', 'USER_SEARCH_FAILED');
    return (data ?? []).map((user) => mapUser(user));
  },

  async update(id: string, input: { username?: string; bio?: string | null; status?: string }) {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const user = state.users.find((item) => item.id === id);
      if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
      if (input.username && state.users.some((item) => item.id !== id && item.username.toLowerCase() === input.username!.toLowerCase())) throw new AppError(409, 'Username is already in use', 'USERNAME_EXISTS');
      if (input.username !== undefined) user.username = input.username;
      if (input.bio !== undefined) user.bio = input.bio;
      if (input.status !== undefined) user.status = input.status as typeof user.status;
      return mapUser(user as unknown as Record<string, unknown>);
    });
    const { data, error } = await db.from('users').update(input).eq('id', id).select('*').single();
    if (error || !data) throw new AppError(400, 'Could not update profile', 'PROFILE_UPDATE_FAILED');
    return mapUser(data);
  },

  async uploadAvatar(id: string, file?: Express.Multer.File) {
    if (!file) throw new AppError(400, 'Choose a profile photo to upload', 'AVATAR_REQUIRED');
    let optimized: Buffer;
    try {
      optimized = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 25_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new AppError(400, 'The uploaded file is not a valid image', 'INVALID_AVATAR');
    }

    let avatar: string;
    if (isLocalDevelopment) {
      avatar = `data:image/webp;base64,${optimized.toString('base64')}`;
      return localDb.mutate((state) => {
        const user = state.users.find((item) => item.id === id);
        if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
        user.avatar = avatar;
        return mapUser(user as unknown as Record<string, unknown>);
      });
    }

    const storagePath = `${id}/avatar.webp`;
    const { error: uploadError } = await db.storage.from('avatars').upload(storagePath, optimized, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadError) throw new AppError(500, 'Could not upload profile photo', 'AVATAR_UPLOAD_FAILED');
    const { data: publicData } = db.storage.from('avatars').getPublicUrl(storagePath);
    avatar = `${publicData.publicUrl}?v=${Date.now()}`;
    const { data, error } = await db.from('users').update({ avatar }).eq('id', id).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not update profile photo', 'AVATAR_UPDATE_FAILED');
    return mapUser(data);
  },

  async setPresence(id: string, status: 'online' | 'offline', lastSeen = new Date().toISOString()) {
    if (isLocalDevelopment) {
      await localDb.mutate((state) => { const user = state.users.find((item) => item.id === id); if (user) { user.status = status; user.last_seen = lastSeen; } });
      return;
    }
    await db.from('users').update({ status, last_seen: lastSeen }).eq('id', id);
  },
};
