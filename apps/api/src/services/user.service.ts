import sharp from 'sharp';
import bcrypt from 'bcryptjs';
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
    const { data } = await db.from('users').select('id,username,avatar,bio,status,last_seen,show_avatar,show_last_seen').eq('id', id).maybeSingle();
    if (!data) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return mapUser(data);
  },

  async search(query: string, currentUserId: string) {
    const safe = query.trim().slice(0, 50);
    if (safe.length < 2) return [];
    if (isLocalDevelopment) return localDb.read((state) => state.users.filter((user) => user.id !== currentUserId && user.email_verified && user.allow_friend_requests !== false && user.username.toLowerCase().includes(safe.toLowerCase())).slice(0, 20).map((user) => mapUser(user as unknown as Record<string, unknown>)));
    const { data, error } = await db.from('users').select('id,username,avatar,bio,status,last_seen,show_avatar,show_last_seen,allow_friend_requests').neq('id', currentUserId).eq('email_verified', true).eq('allow_friend_requests', true).ilike('username', `%${safe}%`).limit(20);
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
    if (input.username) {
      const { data: candidates } = await db.from('users').select('id,username').ilike('username', input.username).limit(10);
      if ((candidates ?? []).some((item) => item.id !== id && item.username.toLowerCase() === input.username!.toLowerCase())) {
        throw new AppError(409, 'Username is already in use', 'USERNAME_EXISTS');
      }
    }
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

  async accountControls(id: string) {
    if (isLocalDevelopment) {
      const user = await localDb.read((state) => state.users.find((item) => item.id === id));
      if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
      return {
        showLastSeen: user.show_last_seen !== false,
        showAvatar: user.show_avatar !== false,
        allowFriendRequests: user.allow_friend_requests !== false,
      };
    }
    const { data } = await db.from('users').select('show_last_seen,show_avatar,allow_friend_requests').eq('id', id).maybeSingle();
    if (!data) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return { showLastSeen: data.show_last_seen, showAvatar: data.show_avatar, allowFriendRequests: data.allow_friend_requests };
  },

  async updateAccountControls(id: string, input: { showLastSeen?: boolean; showAvatar?: boolean; allowFriendRequests?: boolean }) {
    const values = {
      ...(input.showLastSeen !== undefined ? { show_last_seen: input.showLastSeen } : {}),
      ...(input.showAvatar !== undefined ? { show_avatar: input.showAvatar } : {}),
      ...(input.allowFriendRequests !== undefined ? { allow_friend_requests: input.allowFriendRequests } : {}),
    };
    if (isLocalDevelopment) {
      return localDb.mutate((state) => {
        const user = state.users.find((item) => item.id === id);
        if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
        Object.assign(user, values);
        return { showLastSeen: user.show_last_seen !== false, showAvatar: user.show_avatar !== false, allowFriendRequests: user.allow_friend_requests !== false };
      });
    }
    const { data, error } = await db.from('users').update(values).eq('id', id).select('show_last_seen,show_avatar,allow_friend_requests').single();
    if (error || !data) throw new AppError(400, 'Could not update privacy settings', 'PRIVACY_UPDATE_FAILED');
    return { showLastSeen: data.show_last_seen, showAvatar: data.show_avatar, allowFriendRequests: data.allow_friend_requests };
  },

  async exportAccount(id: string) {
    if (isLocalDevelopment) return localDb.read((state) => {
      const user = state.users.find((item) => item.id === id);
      const profile = user ? {
        id: user.id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio,
        status: user.status, last_seen: user.last_seen, email_verified: user.email_verified,
        created_at: user.created_at, show_last_seen: user.show_last_seen, show_avatar: user.show_avatar,
        allow_friend_requests: user.allow_friend_requests,
      } : null;
      return {
      exportedAt: new Date().toISOString(),
      profile,
      friends: state.friends.filter((item) => item.requester_id === id || item.receiver_id === id),
      messages: state.messages.filter((item) => item.sender_id === id || item.receiver_id === id),
      calls: state.calls.filter((item) => item.caller_id === id || item.receiver_id === id || item.participant_ids.includes(id)),
      groups: state.groups.filter((group) => state.groupMembers.some((member) => member.group_id === group.id && member.user_id === id)),
      groupMessages: state.groupMessages.filter((item) => item.sender_id === id),
    };
    });
    const [profile, friends, sentMessages, receivedMessages, calls, memberships, groupMessages] = await Promise.all([
      db.from('users').select('id,username,email,avatar,bio,status,last_seen,email_verified,created_at,show_last_seen,show_avatar,allow_friend_requests').eq('id', id).single(),
      db.from('friends').select('*').or(`requester_id.eq.${id},receiver_id.eq.${id}`),
      db.from('messages').select('*').eq('sender_id', id),
      db.from('messages').select('*').eq('receiver_id', id),
      db.from('calls').select('*').or(`caller_id.eq.${id},receiver_id.eq.${id}`),
      db.from('group_members').select('group_id,role,joined_at,group:groups(*)').eq('user_id', id),
      db.from('group_messages').select('*').eq('sender_id', id),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      friends: friends.data ?? [],
      messages: [...(sentMessages.data ?? []), ...(receivedMessages.data ?? [])],
      calls: calls.data ?? [],
      groups: memberships.data ?? [],
      groupMessages: groupMessages.data ?? [],
    };
  },

  async deleteAccount(id: string, password: string) {
    if (isLocalDevelopment) {
      return localDb.mutate(async (state) => {
        const user = state.users.find((item) => item.id === id);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new AppError(401, 'Password is incorrect', 'INVALID_PASSWORD');
        const ownedGroupIds = state.groups.filter((item) => item.owner_id === id).map((item) => item.id);
        state.users = state.users.filter((item) => item.id !== id);
        state.friends = state.friends.filter((item) => item.requester_id !== id && item.receiver_id !== id);
        state.messages = state.messages.filter((item) => item.sender_id !== id && item.receiver_id !== id);
        state.calls = state.calls.filter((item) => item.caller_id !== id && item.receiver_id !== id && !item.participant_ids.includes(id));
        state.notifications = state.notifications.filter((item) => item.user_id !== id);
        state.refreshTokens = state.refreshTokens.filter((item) => item.user_id !== id);
        state.verificationTokens = state.verificationTokens.filter((item) => item.user_id !== id);
        state.passwordResetTokens = state.passwordResetTokens.filter((item) => item.user_id !== id);
        state.pushSubscriptions = state.pushSubscriptions.filter((item) => item.user_id !== id);
        state.groups = state.groups.filter((item) => item.owner_id !== id);
        state.groupMembers = state.groupMembers.filter((item) => item.user_id !== id && !ownedGroupIds.includes(item.group_id));
        state.groupMessages = state.groupMessages.filter((item) => item.sender_id !== id && !ownedGroupIds.includes(item.group_id));
        state.blocks = state.blocks.filter((item) => item.blocker_id !== id && item.blocked_id !== id);
        state.reports = state.reports.filter((item) => item.reporter_id !== id && item.reported_id !== id);
      });
    }
    const { data } = await db.from('users').select('password_hash').eq('id', id).maybeSingle();
    if (!data || !(await bcrypt.compare(password, data.password_hash))) throw new AppError(401, 'Password is incorrect', 'INVALID_PASSWORD');
    const { error } = await db.from('users').delete().eq('id', id);
    if (error) throw new AppError(500, 'Could not delete account', 'ACCOUNT_DELETE_FAILED');
  },
};
