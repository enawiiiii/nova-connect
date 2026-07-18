import type { Group, GroupMessage } from '@nova/shared';
import crypto from 'node:crypto';
import { db } from '../database/supabase.js';
import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { friendService } from './friend.service.js';

async function localGroup(groupId: string, userId: string): Promise<Group> {
  return localDb.read((state) => {
    const group = state.groups.find((item) => item.id === groupId);
    const membership = state.groupMembers.find((item) => item.group_id === groupId && item.user_id === userId);
    if (!group || !membership) throw new AppError(404, 'Group not found', 'GROUP_NOT_FOUND');
    const members = state.groupMembers.filter((item) => item.group_id === groupId).flatMap((item) => {
      const user = state.users.find((candidate) => candidate.id === item.user_id);
      return user ? [mapUser(user as unknown as Record<string, unknown>)] : [];
    });
    return { id: group.id, name: group.name, avatar: group.avatar, ownerId: group.owner_id, role: membership.role, members, createdAt: group.created_at };
  });
}

async function productionGroup(groupId: string, userId: string): Promise<Group> {
  const { data: membership } = await db.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  if (!membership) throw new AppError(404, 'Group not found', 'GROUP_NOT_FOUND');
  const [{ data: group }, { data: memberRows }] = await Promise.all([
    db.from('groups').select('*').eq('id', groupId).single(),
    db.from('group_members').select('user_id,user:users(id,username,avatar,bio,status,last_seen)').eq('group_id', groupId),
  ]);
  if (!group) throw new AppError(404, 'Group not found', 'GROUP_NOT_FOUND');
  return {
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    ownerId: group.owner_id,
    role: membership.role,
    members: (memberRows ?? []).map((row) => mapUser(row.user as unknown as Record<string, unknown>)),
    createdAt: group.created_at,
  };
}

export const groupService = {
  async list(userId: string) {
    if (isLocalDevelopment) {
      const ids = await localDb.read((state) => state.groupMembers.filter((item) => item.user_id === userId).map((item) => item.group_id));
      return Promise.all(ids.map((id) => localGroup(id, userId)));
    }
    const { data } = await db.from('group_members').select('group_id').eq('user_id', userId).order('joined_at', { ascending: false });
    return Promise.all((data ?? []).map((row) => productionGroup(row.group_id, userId)));
  },

  async create(ownerId: string, name: string, memberIds: string[]) {
    const selected = [...new Set(memberIds)].filter((id) => id !== ownerId).slice(0, 49);
    for (const memberId of selected) {
      if (!(await friendService.areFriends(ownerId, memberId))) throw new AppError(403, 'Groups can include friends only', 'GROUP_MEMBER_NOT_FRIEND');
    }
    const now = new Date().toISOString();
    if (isLocalDevelopment) {
      const id = crypto.randomUUID();
      await localDb.mutate((state) => {
        state.groups.push({ id, owner_id: ownerId, name: name.trim(), avatar: null, created_at: now });
        state.groupMembers.push({ group_id: id, user_id: ownerId, role: 'owner', joined_at: now }, ...selected.map((userId) => ({ group_id: id, user_id: userId, role: 'member' as const, joined_at: now })));
      });
      return localGroup(id, ownerId);
    }
    const { data: group, error } = await db.from('groups').insert({ owner_id: ownerId, name: name.trim() }).select('*').single();
    if (error || !group) throw new AppError(500, 'Could not create group', 'GROUP_CREATE_FAILED');
    const { error: memberError } = await db.from('group_members').insert([
      { group_id: group.id, user_id: ownerId, role: 'owner' },
      ...selected.map((userId) => ({ group_id: group.id, user_id: userId, role: 'member' })),
    ]);
    if (memberError) throw new AppError(500, 'Could not add group members', 'GROUP_MEMBERS_FAILED');
    return productionGroup(group.id, ownerId);
  },

  async messages(userId: string, groupId: string) {
    if (isLocalDevelopment) {
      await localGroup(groupId, userId);
      return localDb.read((state) => state.groupMessages.filter((item) => item.group_id === groupId).slice(-100).map((item): GroupMessage => ({
        id: item.id, groupId: item.group_id, senderId: item.sender_id, messageText: item.message_text, createdAt: item.created_at,
      })));
    }
    await productionGroup(groupId, userId);
    const { data, error } = await db.from('group_messages').select('*').eq('group_id', groupId).order('created_at').limit(100);
    if (error) throw new AppError(500, 'Could not load group messages');
    return (data ?? []).map((item): GroupMessage => ({ id: item.id, groupId: item.group_id, senderId: item.sender_id, messageText: item.message_text, createdAt: item.created_at }));
  },

  async send(userId: string, groupId: string, text: string) {
    const group = isLocalDevelopment ? await localGroup(groupId, userId) : await productionGroup(groupId, userId);
    const now = new Date().toISOString();
    let message: GroupMessage;
    if (isLocalDevelopment) {
      message = await localDb.mutate((state) => {
        const item = { id: crypto.randomUUID(), group_id: groupId, sender_id: userId, message_text: text.trim(), created_at: now };
        state.groupMessages.push(item);
        return { id: item.id, groupId, senderId: userId, messageText: item.message_text, createdAt: now };
      });
    } else {
      const { data, error } = await db.from('group_messages').insert({ group_id: groupId, sender_id: userId, message_text: text.trim() }).select('*').single();
      if (error || !data) throw new AppError(500, 'Could not send group message');
      message = { id: data.id, groupId, senderId: userId, messageText: data.message_text, createdAt: data.created_at };
    }
    return { message, group };
  },

  async updateMembers(actorId: string, groupId: string, addIds: string[], removeIds: string[]) {
    const group = isLocalDevelopment ? await localGroup(groupId, actorId) : await productionGroup(groupId, actorId);
    if (!['owner', 'admin'].includes(group.role)) throw new AppError(403, 'Group admin permission required', 'GROUP_ADMIN_REQUIRED');
    const add = [...new Set(addIds)].filter((id) => !group.members.some((member) => member.id === id));
    for (const memberId of add) if (!(await friendService.areFriends(actorId, memberId))) throw new AppError(403, 'Groups can include friends only', 'GROUP_MEMBER_NOT_FRIEND');
    const remove = [...new Set(removeIds)].filter((id) => id !== group.ownerId);
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        const now = new Date().toISOString();
        state.groupMembers.push(...add.map((userId) => ({ group_id: groupId, user_id: userId, role: 'member' as const, joined_at: now })));
        state.groupMembers = state.groupMembers.filter((item) => item.group_id !== groupId || !remove.includes(item.user_id));
      });
      return localGroup(groupId, actorId);
    }
    if (add.length) await db.from('group_members').insert(add.map((userId) => ({ group_id: groupId, user_id: userId })));
    if (remove.length) await db.from('group_members').delete().eq('group_id', groupId).in('user_id', remove);
    return productionGroup(groupId, actorId);
  },
};
