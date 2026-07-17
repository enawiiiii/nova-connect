import type { CallType } from '@nova/shared';
import crypto from 'node:crypto';
import { env, isLocalDevelopment } from '../config/env.js';
import { db } from '../database/supabase.js';
import { localDb, type LocalCall } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapCall } from '../utils/mappers.js';
import { friendService } from './friend.service.js';

export const callService = {
  iceServers(userId: string) {
    const servers: Array<{ urls: string[] | string; username?: string; credential?: string }> = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    if (!env.TURN_URL || !env.TURN_SECRET) return servers;
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    servers.push({ urls: env.TURN_URL, username, credential });
    return servers;
  },
  async roomAccess(userId: string, roomId: string) {
    if (isLocalDevelopment) return localDb.read((state) => {
      const call = state.calls.find((item) => item.room_id === roomId);
      if (!call) throw new AppError(404, 'Call not found', 'CALL_NOT_FOUND');
      const participantUserIds = [...new Set([call.caller_id, ...(call.receiver_id ? [call.receiver_id] : []), ...(call.participant_ids ?? [])])];
      if (!participantUserIds.includes(userId)) throw new AppError(403, 'You are not invited to this call', 'CALL_NOT_ALLOWED');
      return { callId: call.id, callerId: call.caller_id, mode: call.call_type === 'group' ? 'group' as const : 'individual' as const, participantUserIds, status: call.status };
    });

    const { data: call, error } = await db.from('calls').select('id,caller_id,receiver_id,call_type,status').eq('room_id', roomId).maybeSingle();
    if (error || !call) throw new AppError(404, 'Call not found', 'CALL_NOT_FOUND');
    const { data: participantRows, error: participantError } = await db.from('call_participants').select('user_id').eq('call_id', call.id);
    if (participantError) throw new AppError(500, 'Could not authorize call');
    const participantUserIds = [...new Set([call.caller_id, ...(call.receiver_id ? [call.receiver_id] : []), ...(participantRows ?? []).map((item) => item.user_id)])];
    if (!participantUserIds.includes(userId)) throw new AppError(403, 'You are not invited to this call', 'CALL_NOT_ALLOWED');
    return { callId: call.id, callerId: call.caller_id, mode: call.call_type === 'group' ? 'group' as const : 'individual' as const, participantUserIds, status: call.status };
  },
  async joinRoom(userId: string, roomId: string) {
    const access = await callService.roomAccess(userId, roomId);
    if (isLocalDevelopment) {
      if (userId !== access.callerId && access.status === 'ringing') {
        await localDb.mutate((state) => {
          const call = state.calls.find((item) => item.id === access.callId);
          if (call?.status === 'ringing') call.status = 'answered';
        });
      }
      return access;
    }
    const joinedAt = new Date().toISOString();
    const { error: participantError } = await db.from('call_participants').update({ joined_at: joinedAt, left_at: null }).eq('call_id', access.callId).eq('user_id', userId);
    if (participantError) throw new AppError(500, 'Could not join call', 'CALL_JOIN_FAILED');
    if (userId !== access.callerId && access.status === 'ringing') {
      const { error } = await db.from('calls').update({ status: 'answered' }).eq('id', access.callId).eq('status', 'ringing');
      if (error) throw new AppError(500, 'Could not update call status', 'CALL_STATUS_FAILED');
    }
    return access;
  },
  async leaveRoom(userId: string, roomId: string) {
    const access = await callService.roomAccess(userId, roomId);
    if (access.mode === 'individual' && (access.status === 'ringing' || access.status === 'answered')) {
      if (isLocalDevelopment) {
        await localDb.mutate((state) => {
          const call = state.calls.find((item) => item.id === access.callId);
          if (call && (call.status === 'ringing' || call.status === 'answered')) call.status = 'ended';
        });
      } else {
        const { error } = await db.from('calls').update({ status: 'ended' }).eq('id', access.callId).in('status', ['ringing', 'answered']);
        if (error) throw new AppError(500, 'Could not end call', 'CALL_END_FAILED');
      }
    }
    if (access.mode === 'group' && !isLocalDevelopment) {
      const { error } = await db.from('call_participants').update({ left_at: new Date().toISOString() }).eq('call_id', access.callId).eq('user_id', userId);
      if (error) throw new AppError(500, 'Could not leave call', 'CALL_LEAVE_FAILED');
    }
    return access;
  },
  async declineRoom(userId: string, roomId: string) {
    const access = await callService.roomAccess(userId, roomId);
    if (access.mode !== 'individual' || userId === access.callerId) throw new AppError(403, 'This call cannot be declined', 'CALL_DECLINE_NOT_ALLOWED');
    if (access.status !== 'ringing') return access;
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        const call = state.calls.find((item) => item.id === access.callId);
        if (call?.status === 'ringing') call.status = 'declined';
      });
    } else {
      const { error } = await db.from('calls').update({ status: 'declined' }).eq('id', access.callId).eq('status', 'ringing');
      if (error) throw new AppError(500, 'Could not decline call', 'CALL_DECLINE_FAILED');
    }
    return access;
  },
  async list(userId: string) {
    const staleCutoff = new Date(Date.now() - 60_000).toISOString();
    if (isLocalDevelopment) return localDb.mutate((state) => {
      state.calls.forEach((call) => {
        if (call.status === 'ringing' && call.created_at < staleCutoff) call.status = 'missed';
      });
      return state.calls.filter((call) => call.caller_id === userId || call.receiver_id === userId || call.participant_ids?.includes(userId)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map((call) => mapCall(call as unknown as Record<string, unknown>));
    });
    await db.from('calls').update({ status: 'missed' }).eq('status', 'ringing').lt('created_at', staleCutoff);
    const [{ data: direct, error }, { data: participations }] = await Promise.all([
      db.from('calls').select('*').or(`caller_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false }).limit(50),
      db.from('call_participants').select('call_id').eq('user_id', userId),
    ]);
    if (error) throw new AppError(500, 'Could not load call history');
    const participantIds = [...new Set((participations ?? []).map((item) => item.call_id))];
    const { data: participantCalls } = participantIds.length ? await db.from('calls').select('*').in('id', participantIds) : { data: [] };
    const merged = new Map([...(direct ?? []), ...(participantCalls ?? [])].map((call) => [call.id, call]));
    return [...merged.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50).map(mapCall);
  },
  async start(callerId: string, receiverId: string | null, callType: CallType, roomId: string, participantIds: string[] = []) {
    const participants = [...new Set(participantIds)].filter((id) => id !== callerId);
    if (callType === 'group' && (receiverId || participants.length === 0)) throw new AppError(400, 'A group call needs at least one selected friend', 'INVALID_GROUP_CALL');
    if (callType !== 'group' && (!receiverId || participants.length > 0)) throw new AppError(400, 'An individual call needs one receiver', 'INVALID_INDIVIDUAL_CALL');
    const targets = callType === 'group' ? participants : [receiverId!];
    const friendshipChecks = await Promise.all(targets.map((targetId) => friendService.areFriends(callerId, targetId)));
    if (friendshipChecks.some((allowed) => !allowed)) throw new AppError(403, 'Calls can only be started with friends', 'CALL_NOT_ALLOWED');

    if (isLocalDevelopment) return localDb.mutate((state) => {
      if (state.calls.some((item) => item.room_id === roomId)) throw new AppError(409, 'This call room already exists', 'CALL_ROOM_EXISTS');
      const call: LocalCall = { id: crypto.randomUUID(), caller_id: callerId, receiver_id: receiverId, room_id: roomId, call_type: callType, duration: 0, status: 'ringing', participant_ids: participants, created_at: new Date().toISOString() };
      state.calls.push(call);
      return mapCall(call as unknown as Record<string, unknown>);
    });
    const { data, error } = await db.from('calls').insert({ caller_id: callerId, receiver_id: receiverId, call_type: callType, room_id: roomId }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not start call');
    const callParticipants = [...new Set([callerId, ...(receiverId ? [receiverId] : []), ...participants])];
    const { error: participantError } = await db.from('call_participants').insert(callParticipants.map((userId) => ({ call_id: data.id, user_id: userId, joined_at: userId === callerId ? new Date().toISOString() : null })));
    if (participantError) {
      await db.from('calls').delete().eq('id', data.id);
      throw new AppError(500, 'Could not prepare call participants', 'CALL_PARTICIPANTS_FAILED');
    }
    return mapCall(data);
  },
  async finish(userId: string, callId: string, duration: number, status: string) {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const call = state.calls.find((item) => item.id === callId && (item.caller_id === userId || item.receiver_id === userId));
      if (!call) throw new AppError(404, 'Call not found');
      call.duration = duration;
      call.status = status as LocalCall['status'];
      return mapCall(call as unknown as Record<string, unknown>);
    });
    const { data, error } = await db.from('calls').update({ duration, status }).eq('id', callId).or(`caller_id.eq.${userId},receiver_id.eq.${userId}`).select('*').maybeSingle();
    if (error || !data) throw new AppError(404, 'Call not found');
    await db.from('call_participants').update({ left_at: new Date().toISOString() }).eq('call_id', callId).eq('user_id', userId);
    return mapCall(data);
  },
};
