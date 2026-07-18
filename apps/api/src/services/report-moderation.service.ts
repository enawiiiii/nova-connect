import { isLocalDevelopment } from '../config/env.js';
import { localDb, type LocalReport, type LocalUser } from '../database/local.database.js';
import { db } from '../database/supabase.js';
import { AppError } from '../utils/errors.js';
import { accountModerationService } from './account-moderation.service.js';
import { monitoringService } from './monitoring.service.js';
import { notificationService } from './notification.service.js';
import { privacyService } from './privacy.service.js';

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportReason = 'spam' | 'harassment' | 'impersonation' | 'unsafe' | 'other';
export type ModerationAction = 'none' | 'warn' | 'protect_reporter' | 'restore_contact' | 'revoke_sessions' | 'suspend_24h' | 'suspend_7d' | 'restore_account';

interface ReportFilters {
  status?: ReportStatus;
  reason?: ReportReason;
  search?: string;
  page: number;
  limit: number;
}

interface UpdateReportInput {
  status?: ReportStatus;
  action?: ModerationAction;
  note?: string;
}

type UserRow = Pick<LocalUser, 'id' | 'username' | 'email' | 'avatar' | 'status' | 'last_seen' | 'created_at'>;
type ReportRow = LocalReport;

const cleanUser = (user?: UserRow) => user ? ({
  id: user.id,
  username: user.username,
  email: user.email,
  avatar: user.avatar,
  status: user.status,
  lastSeen: user.last_seen,
  createdAt: user.created_at,
}) : null;

function priorityFor(report: ReportRow, repeatCount: number) {
  const ageHours = (Date.now() - new Date(report.created_at).getTime()) / 3_600_000;
  if (report.reason === 'unsafe' || repeatCount >= 3) return 'urgent';
  if (['harassment', 'impersonation'].includes(report.reason) || ageHours >= 24) return 'high';
  return 'normal';
}

function decorate(report: ReportRow, users: Map<string, UserRow>, repeatCount: number) {
  return {
    id: report.id,
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.created_at,
    reporter: cleanUser(users.get(report.reporter_id)),
    reported: cleanUser(users.get(report.reported_id)),
    reportedReportCount: repeatCount,
    priority: priorityFor(report, repeatCount),
  };
}

async function loadRows() {
  if (isLocalDevelopment) {
    return localDb.read((state) => ({
      reports: state.reports.slice(),
      users: state.users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        last_seen: user.last_seen,
        created_at: user.created_at,
      })),
    }));
  }
  const { data: reports, error } = await db.from('user_reports').select('id,reporter_id,reported_id,reason,details,status,created_at').order('created_at', { ascending: false }).limit(2000);
  if (error) throw new AppError(500, 'Could not load reports', 'REPORTS_LOAD_FAILED');
  const ids = [...new Set((reports ?? []).flatMap((report) => [report.reporter_id, report.reported_id]))];
  const users = ids.length
    ? ((await db.from('users').select('id,username,email,avatar,status,last_seen,created_at').in('id', ids)).data ?? [])
    : [];
  return { reports: (reports ?? []) as ReportRow[], users: users as UserRow[] };
}

async function rawReport(id: string): Promise<ReportRow> {
  if (isLocalDevelopment) {
    const report = await localDb.read((state) => state.reports.find((item) => item.id === id));
    if (!report) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
    return report;
  }
  const { data, error } = await db.from('user_reports').select('id,reporter_id,reported_id,reason,details,status,created_at').eq('id', id).maybeSingle();
  if (error || !data) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
  return data as ReportRow;
}

async function historyFor(reportId: string) {
  const events = isLocalDevelopment
    ? await localDb.read((state) => state.appEvents.filter((event) => event.source === 'report-moderation' && event.details?.reportId === reportId))
    : (((await db.from('app_events').select('id,user_id,message,details,created_at').eq('source', 'report-moderation').eq('details->>reportId', reportId).order('created_at', { ascending: false })).data ?? []) as Array<{ id: string; user_id: string | null; message: string; details: Record<string, unknown> | null; created_at: string }>);
  const adminIds = [...new Set(events.flatMap((event) => event.user_id ? [event.user_id] : []))];
  const admins = isLocalDevelopment
    ? await localDb.read((state) => state.users.filter((user) => adminIds.includes(user.id)).map((user) => ({ id: user.id, username: user.username })))
    : adminIds.length ? ((await db.from('users').select('id,username').in('id', adminIds)).data ?? []) : [];
  const names = new Map(admins.map((admin) => [admin.id, admin.username]));
  return events.map((event) => ({
    id: event.id,
    message: event.message,
    action: String(event.details?.action ?? 'status_update'),
    note: typeof event.details?.note === 'string' ? event.details.note : null,
    previousStatus: typeof event.details?.previousStatus === 'string' ? event.details.previousStatus : null,
    nextStatus: typeof event.details?.nextStatus === 'string' ? event.details.nextStatus : null,
    statusChanged: event.details?.statusChanged === true || (
      typeof event.details?.previousStatus === 'string'
      && typeof event.details?.nextStatus === 'string'
      && event.details.previousStatus !== event.details.nextStatus
    ),
    admin: event.user_id ? { id: event.user_id, username: names.get(event.user_id) ?? 'مدير' } : null,
    createdAt: event.created_at,
  }));
}

function hasActiveReportProtection(
  history: Awaited<ReturnType<typeof historyFor>>,
  directBlock: boolean,
) {
  const latestProtectionAction = history.find((event) => (
    event.action === 'protect_reporter' || event.action === 'restore_contact'
  ));
  return directBlock && latestProtectionAction?.action === 'protect_reporter';
}

export const reportModerationService = {
  async list(filters: ReportFilters) {
    const { reports, users } = await loadRows();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const reportCountByUser = new Map<string, number>();
    reports.forEach((report) => reportCountByUser.set(report.reported_id, (reportCountByUser.get(report.reported_id) ?? 0) + 1));
    const summary = {
      total: reports.length,
      open: reports.filter((report) => report.status === 'open').length,
      reviewing: reports.filter((report) => report.status === 'reviewing').length,
      resolved: reports.filter((report) => report.status === 'resolved').length,
      dismissed: reports.filter((report) => report.status === 'dismissed').length,
      urgent: reports.filter((report) => priorityFor(report, reportCountByUser.get(report.reported_id) ?? 1) === 'urgent' && !['resolved', 'dismissed'].includes(report.status)).length,
    };
    const search = filters.search?.trim().toLowerCase() ?? '';
    const filtered = reports
      .filter((report) => !filters.status || report.status === filters.status)
      .filter((report) => !filters.reason || report.reason === filters.reason)
      .filter((report) => {
        if (!search) return true;
        const reporter = usersById.get(report.reporter_id);
        const reported = usersById.get(report.reported_id);
        return [report.id, report.reason, report.details, reporter?.username, reporter?.email, reported?.username, reported?.email]
          .some((value) => String(value ?? '').toLowerCase().includes(search));
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const start = (filters.page - 1) * filters.limit;
    return {
      items: filtered.slice(start, start + filters.limit).map((report) => decorate(report, usersById, reportCountByUser.get(report.reported_id) ?? 1)),
      summary,
      pagination: { page: filters.page, limit: filters.limit, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / filters.limit)) },
    };
  },

  async detail(id: string) {
    const report = await rawReport(id);
    const { reports, users } = await loadRows();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const repeatCount = reports.filter((item) => item.reported_id === report.reported_id).length;
    const [history, accountModeration, directBlock] = await Promise.all([
      historyFor(id),
      accountModerationService.state(report.reported_id),
      privacyService.hasDirectBlock(report.reporter_id, report.reported_id),
    ]);
    return {
      ...decorate(report, usersById, repeatCount),
      history,
      accountModeration,
      contactBlocked: directBlock,
      reporterProtected: hasActiveReportProtection(history, directBlock),
    };
  },

  async update(id: string, adminId: string, input: UpdateReportInput) {
    const before = await rawReport(id);
    const nextStatus = input.status ?? before.status as ReportStatus;
    const action = input.action ?? 'none';
    const note = input.note?.trim() || null;
    const statusChanged = nextStatus !== before.status;
    const allowedTransitions: Record<ReportStatus, ReportStatus[]> = {
      open: ['reviewing'],
      reviewing: ['resolved', 'dismissed'],
      resolved: [],
      dismissed: [],
    };
    if (statusChanged && !allowedTransitions[before.status as ReportStatus].includes(nextStatus)) {
      throw new AppError(409, 'This report status is final or the requested transition is not allowed', 'REPORT_STATUS_LOCKED');
    }
    if (!statusChanged && action === 'none' && !note) {
      throw new AppError(409, 'No new report change was provided', 'NO_REPORT_CHANGE');
    }
    if (before.status === 'open' && action !== 'none') {
      throw new AppError(409, 'Start reviewing the report before applying an account action', 'REPORT_REVIEW_REQUIRED');
    }
    if (['resolved', 'dismissed'].includes(before.status) && !['none', 'restore_account', 'restore_contact'].includes(action)) {
      throw new AppError(409, 'Closed reports cannot receive new punitive actions', 'REPORT_CLOSED');
    }

    const [history, accountState, directBlock] = await Promise.all([
      historyFor(id),
      accountModerationService.state(before.reported_id),
      privacyService.hasDirectBlock(before.reporter_id, before.reported_id),
    ]);
    const reporterProtected = hasActiveReportProtection(history, directBlock);
    const appliedActions = new Set(history.map((event) => event.action));
    if (!['none', 'restore_account', 'restore_contact'].includes(action) && appliedActions.has(action)) {
      throw new AppError(409, 'This moderation action was already applied to the report', 'ACTION_ALREADY_APPLIED');
    }
    if (['suspend_24h', 'suspend_7d'].includes(action) && accountState.suspendedUntil) {
      throw new AppError(409, 'The account is already suspended', 'ACCOUNT_ALREADY_SUSPENDED');
    }
    if (action === 'restore_account' && !accountState.suspendedUntil) {
      throw new AppError(409, 'The account is not currently suspended', 'ACCOUNT_NOT_SUSPENDED');
    }
    if (action === 'protect_reporter' && directBlock) {
      throw new AppError(
        409,
        reporterProtected ? 'The reporter is already protected from this account' : 'The reporter already blocks this account directly',
        reporterProtected ? 'REPORTER_ALREADY_PROTECTED' : 'CONTACT_ALREADY_BLOCKED',
      );
    }
    if (action === 'restore_contact' && !reporterProtected) {
      throw new AppError(409, 'There is no report protection block to remove', 'REPORTER_NOT_PROTECTED');
    }

    if (statusChanged && isLocalDevelopment) {
      await localDb.mutate((state) => {
        const report = state.reports.find((item) => item.id === id);
        if (!report) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
        if (report.status !== before.status) {
          throw new AppError(409, 'The report was updated by another administrator', 'REPORT_CHANGED');
        }
        report.status = nextStatus;
      });
    } else if (statusChanged) {
      const { data, error } = await db
        .from('user_reports')
        .update({ status: nextStatus })
        .eq('id', id)
        .eq('status', before.status)
        .select('id')
        .maybeSingle();
      if (error) throw new AppError(500, 'Could not update report', 'REPORT_UPDATE_FAILED');
      if (!data) throw new AppError(409, 'The report was updated by another administrator', 'REPORT_CHANGED');
    }

    let suspendedUntil: string | null = null;
    if (action === 'warn') {
      await notificationService.create(before.reported_id, 'system', 'تنبيه من إدارة NOVA: وصلنا بلاغ متعلق بحسابك. يرجى الالتزام بقواعد السلامة واحترام المستخدمين.');
    } else if (action === 'protect_reporter') {
      await privacyService.block(before.reporter_id, before.reported_id);
    } else if (action === 'restore_contact') {
      await privacyService.unblock(before.reporter_id, before.reported_id);
    } else if (action === 'revoke_sessions') {
      await accountModerationService.revokeSessions(before.reported_id);
    } else if (action === 'suspend_24h' || action === 'suspend_7d') {
      const duration = action === 'suspend_24h' ? 86_400_000 : 7 * 86_400_000;
      suspendedUntil = new Date(Date.now() + duration).toISOString();
      await accountModerationService.revokeSessions(before.reported_id);
      await notificationService.create(before.reported_id, 'system', `تم تعليق تسجيل الدخول إلى حسابك حتى ${new Date(suspendedUntil).toLocaleString('ar')}.`);
    } else if (action === 'restore_account') {
      await notificationService.create(before.reported_id, 'system', 'تمت إعادة تفعيل إمكانية تسجيل الدخول إلى حسابك بواسطة إدارة NOVA.');
    }

    await monitoringService.record({
      userId: adminId,
      level: 'info',
      source: 'report-moderation',
      message: statusChanged ? 'تم تحديث حالة البلاغ' : action === 'none' ? 'تمت إضافة ملاحظة إدارية' : 'تم تنفيذ إجراء إداري على البلاغ',
      details: {
        reportId: id,
        targetUserId: before.reported_id,
        action,
        note,
        previousStatus: before.status,
        nextStatus,
        statusChanged,
        suspendedUntil,
      },
    });
    accountModerationService.invalidate(before.reported_id);
    return this.detail(id);
  },
};
