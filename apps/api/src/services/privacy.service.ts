import crypto from 'node:crypto';
import { db } from '../database/supabase.js';
import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';

export const privacyService = {
  async isBlocked(a: string, b: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.blocks.some((item) => (item.blocker_id === a && item.blocked_id === b) || (item.blocker_id === b && item.blocked_id === a)));
    const { data } = await db.from('user_blocks').select('blocker_id').or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).maybeSingle();
    return Boolean(data);
  },
  async list(userId: string) {
    if (isLocalDevelopment) return localDb.read((state) => state.blocks.filter((item) => item.blocker_id === userId).flatMap((item) => {
      const user = state.users.find((candidate) => candidate.id === item.blocked_id);
      return user ? [mapUser(user as unknown as Record<string, unknown>)] : [];
    }));
    const { data } = await db.from('user_blocks').select('blocked:users!user_blocks_blocked_id_fkey(id,username,avatar,bio,status,last_seen)').eq('blocker_id', userId);
    return (data ?? []).map((item) => mapUser(item.blocked as unknown as Record<string, unknown>));
  },
  async block(userId: string, blockedId: string) {
    if (userId === blockedId) throw new AppError(400, 'You cannot block yourself', 'SELF_BLOCK');
    if (isLocalDevelopment) return localDb.mutate((state) => {
      if (!state.blocks.some((item) => item.blocker_id === userId && item.blocked_id === blockedId)) state.blocks.push({ blocker_id: userId, blocked_id: blockedId, created_at: new Date().toISOString() });
      state.friends = state.friends.filter((item) => !([item.requester_id, item.receiver_id].includes(userId) && [item.requester_id, item.receiver_id].includes(blockedId)));
    });
    await db.from('user_blocks').upsert({ blocker_id: userId, blocked_id: blockedId });
    await db.from('friends').delete().or(`and(requester_id.eq.${userId},receiver_id.eq.${blockedId}),and(requester_id.eq.${blockedId},receiver_id.eq.${userId})`);
  },
  async unblock(userId: string, blockedId: string) {
    if (isLocalDevelopment) return localDb.mutate((state) => { state.blocks = state.blocks.filter((item) => item.blocker_id !== userId || item.blocked_id !== blockedId); });
    await db.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
  },
  async report(reporterId: string, reportedId: string, reason: string, details?: string) {
    if (reporterId === reportedId) throw new AppError(400, 'You cannot report yourself', 'SELF_REPORT');
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const report = { id: crypto.randomUUID(), reporter_id: reporterId, reported_id: reportedId, reason, details: details?.trim() || null, status: 'open', created_at: new Date().toISOString() };
      state.reports.push(report);
      return report;
    });
    const { data, error } = await db.from('user_reports').insert({ reporter_id: reporterId, reported_id: reportedId, reason, details: details?.trim() || null }).select('id,status,created_at').single();
    if (error || !data) throw new AppError(500, 'Could not submit report', 'REPORT_FAILED');
    return data;
  },
};
