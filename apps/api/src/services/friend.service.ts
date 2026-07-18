import { db } from '../database/supabase.js';
import crypto from 'node:crypto';
import { isLocalDevelopment } from '../config/env.js';
import { localDb, type LocalFriend } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { notificationService } from './notification.service.js';
import { pushService } from './push.service.js';
import { privacyService } from './privacy.service.js';

const friendSelect = 'id,status,requester_id,receiver_id,created_at,requester:users!friends_requester_id_fkey(id,username,avatar,bio,status,last_seen),receiver:users!friends_receiver_id_fkey(id,username,avatar,bio,status,last_seen)';

export const friendService = {
  async list(userId: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.friends.filter((row) => row.status === 'accepted' && (row.requester_id === userId || row.receiver_id === userId)).sort((a, b) => b.created_at.localeCompare(a.created_at)).flatMap((row) => {
      const otherId = row.requester_id === userId ? row.receiver_id : row.requester_id;
      const user = state.users.find((item) => item.id === otherId);
      return user ? [{ friendshipId: row.id, ...mapUser(user as unknown as Record<string, unknown>) }] : [];
    }));
    const { data, error } = await db.from('friends').select(friendSelect).eq('status', 'accepted').or(`requester_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false });
    if (error) throw new AppError(500, 'Could not load friends', 'FRIENDS_LOAD_FAILED');
    return (data ?? []).map((row) => {
      const other = row.requester_id === userId ? row.receiver : row.requester;
      return { friendshipId: row.id, ...mapUser(other as unknown as Record<string, unknown>) };
    });
  },

  async requests(userId: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.friends.filter((row) => row.receiver_id === userId && row.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at)).flatMap((row) => {
      const user = state.users.find((item) => item.id === row.requester_id);
      return user ? [{ id: row.id, createdAt: row.created_at, user: mapUser(user as unknown as Record<string, unknown>) }] : [];
    }));
    const { data, error } = await db.from('friends').select(friendSelect).eq('receiver_id', userId).eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw new AppError(500, 'Could not load friend requests');
    return (data ?? []).map((row) => ({ id: row.id, createdAt: row.created_at, user: mapUser(row.requester as unknown as Record<string, unknown>) }));
  },

  async send(requesterId: string, receiverId: string, requesterName: string) {
    if (requesterId === receiverId) throw new AppError(400, 'You cannot add yourself', 'SELF_FRIEND');
    if (await privacyService.isBlocked(requesterId, receiverId)) throw new AppError(403, 'Friend request is not allowed', 'USER_BLOCKED');
    if (isLocalDevelopment) {
      const receiverExists = await localDb.read((state) => state.users.some((user) => user.id === receiverId));
      if (!receiverExists) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
      const friend = await localDb.mutate((state) => {
        const existing = state.friends.find((row) => ((row.requester_id === requesterId && row.receiver_id === receiverId) || (row.requester_id === receiverId && row.receiver_id === requesterId)) && ['pending', 'accepted'].includes(row.status));
        if (existing) throw new AppError(409, existing.status === 'accepted' ? 'You are already friends' : 'A request is already pending', 'FRIEND_REQUEST_EXISTS');
        const created: LocalFriend = { id: crypto.randomUUID(), requester_id: requesterId, receiver_id: receiverId, status: 'pending', created_at: new Date().toISOString() };
        state.friends.push(created);
        return created;
      });
      await notificationService.create(receiverId, 'friend_request', `${requesterName} sent you a friend request`);
      void pushService.send(receiverId, {
        title: 'طلب صداقة جديد',
        body: `${requesterName} أرسل إليك طلب صداقة`,
        url: '/app/friends',
        tag: `friend-${friend.id}`,
        kind: 'friend',
      });
      return friend;
    }
    const { data: existing } = await db.from('friends').select('id,status').or(`and(requester_id.eq.${requesterId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${requesterId})`).in('status', ['pending', 'accepted']).maybeSingle();
    if (existing) throw new AppError(409, existing.status === 'accepted' ? 'You are already friends' : 'A request is already pending', 'FRIEND_REQUEST_EXISTS');
    const { data, error } = await db.from('friends').insert({ requester_id: requesterId, receiver_id: receiverId }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not send friend request');
    await notificationService.create(receiverId, 'friend_request', `${requesterName} sent you a friend request`);
    void pushService.send(receiverId, {
      title: 'طلب صداقة جديد',
      body: `${requesterName} أرسل إليك طلب صداقة`,
      url: '/app/friends',
      tag: `friend-${data.id}`,
      kind: 'friend',
    });
    return data;
  },

  async respond(userId: string, requestId: string, action: 'accept' | 'reject', username: string) {
    if (isLocalDevelopment) {
      const requesterId = await localDb.mutate((state) => {
        const request = state.friends.find((row) => row.id === requestId && row.receiver_id === userId && row.status === 'pending');
        if (!request) throw new AppError(404, 'Friend request not found', 'REQUEST_NOT_FOUND');
        request.status = action === 'accept' ? 'accepted' : 'rejected';
        return request.requester_id;
      });
      if (action === 'accept') {
        await notificationService.create(requesterId, 'friend_accepted', `${username} accepted your friend request`);
        void pushService.send(requesterId, {
          title: 'تم قبول طلب الصداقة',
          body: `${username} أصبح ضمن أصدقائك`,
          url: '/app/friends',
          tag: `friend-accepted-${requestId}`,
          kind: 'friend',
        });
      }
      return;
    }
    const { data: request } = await db.from('friends').select('*').eq('id', requestId).eq('receiver_id', userId).eq('status', 'pending').maybeSingle();
    if (!request) throw new AppError(404, 'Friend request not found', 'REQUEST_NOT_FOUND');
    const status = action === 'accept' ? 'accepted' : 'rejected';
    const { error } = await db.from('friends').update({ status }).eq('id', requestId);
    if (error) throw new AppError(500, 'Could not update friend request');
    if (status === 'accepted') {
      await notificationService.create(request.requester_id, 'friend_accepted', `${username} accepted your friend request`);
      void pushService.send(request.requester_id, {
        title: 'تم قبول طلب الصداقة',
        body: `${username} أصبح ضمن أصدقائك`,
        url: '/app/friends',
        tag: `friend-accepted-${requestId}`,
        kind: 'friend',
      });
    }
  },

  async remove(userId: string, friendshipId: string) {
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        const index = state.friends.findIndex((row) => row.id === friendshipId && (row.requester_id === userId || row.receiver_id === userId));
        if (index < 0) throw new AppError(404, 'Friendship not found', 'FRIENDSHIP_NOT_FOUND');
        state.friends.splice(index, 1);
      });
      return;
    }
    const { error, count } = await db.from('friends').delete({ count: 'exact' }).eq('id', friendshipId).or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);
    if (error || !count) throw new AppError(404, 'Friendship not found', 'FRIENDSHIP_NOT_FOUND');
  },

  async areFriends(a: string, b: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.friends.some((row) => row.status === 'accepted' && ((row.requester_id === a && row.receiver_id === b) || (row.requester_id === b && row.receiver_id === a))));
    const { data } = await db.from('friends').select('id').eq('status', 'accepted').or(`and(requester_id.eq.${a},receiver_id.eq.${b}),and(requester_id.eq.${b},receiver_id.eq.${a})`).maybeSingle();
    return Boolean(data);
  },
};
