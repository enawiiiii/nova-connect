import crypto from 'node:crypto';
import { db } from '../database/supabase.js';
import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';

interface EventInput {
  userId?: string | null;
  level?: 'info' | 'warning' | 'error';
  source: string;
  message: string;
  details?: Record<string, unknown> | null;
  path?: string | null;
  userAgent?: string | null;
}

export const monitoringService = {
  async record(input: EventInput) {
    const event = {
      id: crypto.randomUUID(),
      user_id: input.userId ?? null,
      level: input.level ?? 'error',
      source: input.source.slice(0, 40),
      message: input.message.slice(0, 1000),
      details: input.details ?? null,
      path: input.path?.slice(0, 500) ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      created_at: new Date().toISOString(),
    };
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        state.appEvents.unshift(event);
        state.appEvents = state.appEvents.slice(0, 1000);
      });
      return;
    }
    await db.from('app_events').insert(event);
  },

  async overview() {
    if (isLocalDevelopment) return localDb.read((state) => ({
      users: state.users.length,
      onlineUsers: state.users.filter((item) => item.status === 'online').length,
      messages: state.messages.length + state.groupMessages.length,
      calls: state.calls.length,
      openReports: state.reports.filter((item) => item.status === 'open').length,
      errors24h: state.appEvents.filter((item) => item.level === 'error' && Date.now() - new Date(item.created_at).getTime() < 86_400_000).length,
    }));
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [users, onlineUsers, messages, groupMessages, calls, reports, errors] = await Promise.all([
      db.from('users').select('id', { count: 'exact', head: true }),
      db.from('users').select('id', { count: 'exact', head: true }).eq('status', 'online'),
      db.from('messages').select('id', { count: 'exact', head: true }),
      db.from('group_messages').select('id', { count: 'exact', head: true }),
      db.from('calls').select('id', { count: 'exact', head: true }),
      db.from('user_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      db.from('app_events').select('id', { count: 'exact', head: true }).eq('level', 'error').gte('created_at', since),
    ]);
    return { users: users.count ?? 0, onlineUsers: onlineUsers.count ?? 0, messages: (messages.count ?? 0) + (groupMessages.count ?? 0), calls: calls.count ?? 0, openReports: reports.count ?? 0, errors24h: errors.count ?? 0 };
  },

  async reports() {
    if (isLocalDevelopment) return localDb.read((state) => state.reports.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100));
    const { data, error } = await db.from('user_reports').select('*,reporter:users!user_reports_reporter_id_fkey(username),reported:users!user_reports_reported_id_fkey(username)').order('created_at', { ascending: false }).limit(100);
    if (error) throw new AppError(500, 'Could not load reports', 'REPORTS_LOAD_FAILED');
    return data ?? [];
  },

  async updateReport(id: string, status: 'open' | 'reviewing' | 'resolved' | 'dismissed') {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const report = state.reports.find((item) => item.id === id);
      if (!report) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
      report.status = status;
      return report;
    });
    const { data, error } = await db.from('user_reports').update({ status }).eq('id', id).select('*').maybeSingle();
    if (error || !data) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
    return data;
  },

  async errors() {
    if (isLocalDevelopment) return localDb.read((state) => state.appEvents.slice(0, 100));
    const { data, error } = await db.from('app_events').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw new AppError(500, 'Could not load errors', 'ERRORS_LOAD_FAILED');
    return data ?? [];
  },
};
