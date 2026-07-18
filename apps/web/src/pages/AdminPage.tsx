import {
  AlertOctagon, Ban, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Clock3,
  FileWarning, Filter, Flag, History, LockKeyhole, MessageSquareWarning, RefreshCw,
  Search, ShieldAlert, ShieldCheck, ShieldOff, Unlock, UserRound, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
type ReportReason = 'spam' | 'harassment' | 'impersonation' | 'unsafe' | 'other';
type ReportPriority = 'normal' | 'high' | 'urgent';
type ModerationAction = 'none' | 'warn' | 'protect_reporter' | 'restore_contact' | 'revoke_sessions' | 'suspend_24h' | 'suspend_7d' | 'restore_account';

interface ReportUser {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  status: string;
  lastSeen: string | null;
  createdAt: string;
}

interface ReportItem {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  createdAt: string;
  reportedReportCount: number;
  reporter: ReportUser | null;
  reported: ReportUser | null;
}

interface ReportHistory {
  id: string;
  message: string;
  action: string;
  note: string | null;
  previousStatus: string | null;
  nextStatus: string | null;
  statusChanged: boolean;
  admin: { id: string; username: string } | null;
  createdAt: string;
}

interface ReportDetail extends ReportItem {
  history: ReportHistory[];
  accountModeration: { suspendedUntil: string | null };
  contactBlocked: boolean;
  reporterProtected: boolean;
}

interface ReportList {
  items: ReportItem[];
  summary: { total: number; open: number; reviewing: number; resolved: number; dismissed: number; urgent: number };
  pagination: { page: number; limit: number; total: number; pages: number };
}

const statusCopy: Record<ReportStatus, { label: string; hint: string }> = {
  open: { label: 'جديد', hint: 'بانتظار أن يراجعه أحد المديرين' },
  reviewing: { label: 'قيد المراجعة', hint: 'يتم التحقيق واتخاذ القرار' },
  resolved: { label: 'تم الحل', hint: 'اتُّخذ إجراء وأُغلق البلاغ' },
  dismissed: { label: 'مرفوض', hint: 'لم يثبت ما يستدعي إجراءً' },
};

const reasonCopy: Record<ReportReason, string> = {
  harassment: 'مضايقة أو إساءة',
  spam: 'رسائل مزعجة أو احتيال',
  impersonation: 'انتحال شخصية',
  unsafe: 'سلوك أو محتوى غير آمن',
  other: 'سبب آخر',
};

const actionCopy: Record<ModerationAction, { label: string; hint: string }> = {
  none: { label: 'بدون إجراء على الحساب', hint: 'تحديث حالة البلاغ وتسجيل الملاحظة فقط.' },
  warn: { label: 'إرسال تحذير رسمي', hint: 'يصل تنبيه إداري للمستخدم المُبلّغ عنه.' },
  protect_reporter: { label: 'حماية المُبلِّغ', hint: 'تُحذف الصداقة وتتوقف الرسائل والمكالمات بين الطرفين.' },
  restore_contact: { label: 'رفع حظر التواصل', hint: 'يُرفع حظر الحماية الذي فُرض بين الطرفين بسبب هذا البلاغ.' },
  revoke_sessions: { label: 'تسجيل خروج من كل الأجهزة', hint: 'تُلغى جلسات المستخدم الحالية ويُطلب منه تسجيل الدخول مجددًا.' },
  suspend_24h: { label: 'تعليق الحساب 24 ساعة', hint: 'يُمنع تسجيل الدخول وتُلغى الجلسات لمدة يوم.' },
  suspend_7d: { label: 'تعليق الحساب 7 أيام', hint: 'يُمنع تسجيل الدخول وتُلغى الجلسات لمدة أسبوع.' },
  restore_account: { label: 'إعادة تفعيل الحساب', hint: 'يُلغى التعليق الإداري السابق فورًا.' },
};

const moderationErrorCopy: Record<string, string> = {
  REPORT_STATUS_LOCKED: 'حالة البلاغ نهائية ولا يمكن إعادتها إلى حالة سابقة.',
  REPORT_CHANGED: 'عدّل مدير آخر هذا البلاغ. حدّث الصفحة ثم راجع الحالة الجديدة.',
  NO_REPORT_CHANGE: 'لم تُجرِ أي تغيير جديد لحفظه.',
  REPORT_REVIEW_REQUIRED: 'ابدأ مراجعة البلاغ أولًا قبل تنفيذ إجراء على الحساب.',
  REPORT_CLOSED: 'البلاغ مغلق؛ المتاح فقط هو رفع تعليق أو حظر سابق.',
  ACTION_ALREADY_APPLIED: 'تم تنفيذ هذا الإجراء مسبقًا ولا يمكن تكراره على البلاغ نفسه.',
  ACCOUNT_ALREADY_SUSPENDED: 'الحساب معلّق بالفعل. استخدم زر رفع التعليق إذا أردت إلغاءه.',
  ACCOUNT_NOT_SUSPENDED: 'الحساب غير معلّق حاليًا.',
  REPORTER_ALREADY_PROTECTED: 'حماية المُبلّغ مفعّلة بالفعل.',
  CONTACT_ALREADY_BLOCKED: 'المُبلّغ حظر هذا الحساب بنفسه، لذلك لن تغيّر الإدارة اختياره أو ترفعه.',
  REPORTER_NOT_PROTECTED: 'لا يوجد حظر حماية إداري لرفعه.',
};

const relativeTime = (value: string) => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
};

function UserAvatar({ user }: { user: ReportUser | null }) {
  return <span className="report-user-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : (user?.username?.slice(0, 2).toUpperCase() ?? '؟')}</span>;
}

export function AdminPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [data, setData] = useState<ReportList | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [status, setStatus] = useState<ReportStatus | 'all'>('all');
  const [reason, setReason] = useState<ReportReason | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decisionStatus, setDecisionStatus] = useState<ReportStatus>('reviewing');
  const [action, setAction] = useState<ModerationAction>('none');
  const [note, setNote] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadReports = useCallback(async (quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: '25' });
      if (status !== 'all') query.set('status', status);
      if (reason !== 'all') query.set('reason', reason);
      if (debouncedSearch) query.set('search', debouncedSearch);
      const next = await api<ReportList>(`/admin/reports?${query}`, { token: accessToken });
      setData(next);
      if (!selectedId && next.items[0] && window.matchMedia('(min-width: 861px)').matches) setSelectedId(next.items[0].id);
      if (selectedId && !next.items.some((item) => item.id === selectedId)) {
        setSelectedId(next.items[0]?.id ?? '');
        setDetail(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل البلاغات.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [accessToken, debouncedSearch, page, reason, selectedId, status]);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!accessToken || !id) return;
    if (!quiet) setDetailLoading(true);
    try {
      const next = await api<ReportDetail>(`/admin/reports/${id}`, { token: accessToken });
      setDetail(next);
      if (!quiet) {
        setDecisionStatus(next.status === 'open' ? 'reviewing' : next.status);
        setAction('none');
        setNote('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل تفاصيل البلاغ.');
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [loadDetail, selectedId]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !saving) {
        void loadReports(true);
        if (selectedId) void loadDetail(selectedId, true);
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadDetail, loadReports, saving, selectedId]);

  const saveDecision = async (override?: Partial<{ status: ReportStatus; action: ModerationAction; note: string }>) => {
    if (!accessToken || !selectedId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await api<ReportDetail>(`/admin/reports/${selectedId}`, {
        method: 'PATCH',
        token: accessToken,
        body: {
          status: override?.status ?? decisionStatus,
          action: override?.action ?? action,
          note: override?.note ?? note.trim(),
        },
      });
      setDetail(next);
      setDecisionStatus(next.status);
      setAction('none');
      setNote('');
      setNotice('تم حفظ القرار وتنفيذ الإجراء وتوثيقه في سجل البلاغ.');
      await loadReports(true);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code ? moderationErrorCopy[cause.code] ?? cause.message : cause instanceof Error ? cause.message : 'تعذر حفظ القرار.');
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = useMemo(() => data ? [
    { key: 'open', label: 'بلاغات جديدة', value: data.summary.open, icon: Flag },
    { key: 'reviewing', label: 'قيد المراجعة', value: data.summary.reviewing, icon: Clock3 },
    { key: 'urgent', label: 'أولوية عاجلة', value: data.summary.urgent, icon: AlertOctagon },
    { key: 'closed', label: 'مغلقة', value: data.summary.resolved + data.summary.dismissed, icon: ShieldCheck },
  ] : [], [data]);
  const availableActions = useMemo(() => {
    if (!detail) return ['none'] as ModerationAction[];
    const applied = new Set(detail.history.map((event) => event.action));
    return (['none', 'warn', 'protect_reporter', 'revoke_sessions', 'suspend_24h', 'suspend_7d'] as ModerationAction[]).filter((candidate) => {
      if (candidate === 'none') return true;
      if (applied.has(candidate)) return false;
      if (candidate === 'protect_reporter' && detail.contactBlocked) return false;
      if (['suspend_24h', 'suspend_7d'].includes(candidate) && detail.accountModeration.suspendedUntil) return false;
      return true;
    });
  }, [detail]);
  const hasDecisionChange = Boolean(detail && (
    decisionStatus !== detail.status || action !== 'none' || note.trim()
  ));

  return (
    <div className="page reports-admin-page">
      <PageHeader
        title="مركز البلاغات"
        subtitle="مساحة إدارية خاصة لمراجعة البلاغات، حماية المستخدمين، وتوثيق كل قرار."
        action={<button className="button button-ghost admin-refresh" disabled={loading} onClick={() => void loadReports()}><RefreshCw className={loading ? 'spin' : ''} />تحديث</button>}
      />

      {error && <div className="call-page-error" role="alert">{error}</div>}
      {notice && <div className="call-page-notice" role="status">{notice}</div>}

      <section className="report-metrics">
        {summaryCards.map(({ key, label, value, icon: Icon }) => (
          <article className={`glass-panel ${key}`} key={key}><span><Icon /></span><div><small>{label}</small><strong>{value.toLocaleString('ar')}</strong></div></article>
        ))}
      </section>

      <section className="report-toolbar glass-panel">
        <label className="report-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم، البريد، رقم البلاغ أو التفاصيل…" /></label>
        <label><Filter /><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="all">كل الحالات</option>{Object.entries(statusCopy).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}</select></label>
        <label><CircleDot /><select value={reason} onChange={(event) => { setReason(event.target.value as typeof reason); setPage(1); }}><option value="all">كل الأسباب</option>{Object.entries(reasonCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </section>

      <div className={`reports-workspace ${selectedId ? 'has-selection' : ''}`}>
        <section className="reports-queue glass-panel">
          <header><div><span>قائمة المعالجة</span><strong>{data?.pagination.total ?? 0} بلاغ</strong></div>{loading && <RefreshCw className="spin" />}</header>
          <div className="reports-list">
            {!loading && !data?.items.length && <div className="reports-empty"><ShieldCheck /><strong>لا توجد بلاغات مطابقة</strong><p>جرّب تغيير الفلاتر أو البحث.</p></div>}
            {data?.items.map((report) => (
              <button className={`report-ticket ${selectedId === report.id ? 'active' : ''}`} key={report.id} onClick={() => { setSelectedId(report.id); setNotice(''); }}>
                <span className={`report-priority ${report.priority}`} />
                <div className="ticket-top"><span className={`report-status ${report.status}`}>{statusCopy[report.status].label}</span><time>{relativeTime(report.createdAt)}</time></div>
                <strong>{reasonCopy[report.reason]}</strong>
                <p>{report.details || 'لم يكتب المُبلِّغ تفاصيل إضافية.'}</p>
                <div className="ticket-users"><UserAvatar user={report.reporter} /><span><b>{report.reporter?.username ?? 'مستخدم محذوف'}</b><small>ضد {report.reported?.username ?? 'مستخدم محذوف'}</small></span>{report.reportedReportCount > 1 && <em>{report.reportedReportCount} بلاغات</em>}</div>
              </button>
            ))}
          </div>
          {(data?.pagination.pages ?? 1) > 1 && <footer className="report-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronRight /></button><span>{page} / {data?.pagination.pages}</span><button disabled={page >= (data?.pagination.pages ?? 1)} onClick={() => setPage((value) => value + 1)}><ChevronLeft /></button></footer>}
        </section>

        <section className="report-case glass-panel">
          {!selectedId ? <div className="reports-empty"><FileWarning /><strong>اختر بلاغًا لمراجعته</strong><p>ستظهر هنا التفاصيل والإجراءات وسجل القرارات.</p></div> : detailLoading || !detail ? <div className="report-detail-loading"><RefreshCw className="spin" /><span>جارٍ فتح ملف البلاغ…</span></div> : <>
            <header className="case-header">
              <div><span className={`report-status ${detail.status}`}>{statusCopy[detail.status].label}</span><small>#{detail.id.slice(0, 8)}</small><h2>{reasonCopy[detail.reason]}</h2><p>{new Date(detail.createdAt).toLocaleString('ar')}</p></div>
              <button className="case-close-mobile" aria-label="إغلاق التفاصيل" onClick={() => setSelectedId('')}><X /></button>
            </header>

            <div className="case-scroll">
              <section className="case-details">
                <h3><MessageSquareWarning />تفاصيل البلاغ</h3>
                <blockquote>{detail.details || 'لم يكتب المُبلِّغ تفاصيل إضافية.'}</blockquote>
                <div className={`case-priority ${detail.priority}`}><ShieldAlert /><span><strong>{detail.priority === 'urgent' ? 'أولوية عاجلة' : detail.priority === 'high' ? 'أولوية مرتفعة' : 'أولوية عادية'}</strong><small>{detail.reportedReportCount} بلاغات مسجلة ضد هذا الحساب</small></span></div>
              </section>

              <section className="case-people">
                <article><header><span>المُبلِّغ</span><ShieldCheck /></header><div><UserAvatar user={detail.reporter} /><span><strong>{detail.reporter?.username ?? 'مستخدم محذوف'}</strong><small>{detail.reporter?.email ?? 'لا يوجد بريد'}</small></span></div></article>
                <article><header><span>المُبلَّغ عنه</span><UserRound /></header><div><UserAvatar user={detail.reported} /><span><strong>{detail.reported?.username ?? 'مستخدم محذوف'}</strong><small>{detail.reported?.email ?? 'لا يوجد بريد'}</small></span></div>{detail.accountModeration.suspendedUntil && <em><Ban />معلّق حتى {new Date(detail.accountModeration.suspendedUntil).toLocaleString('ar')}</em>}</article>
              </section>

              {detail.status === 'open' && <button className="start-review-button" disabled={saving} onClick={() => void saveDecision({ status: 'reviewing', action: 'none', note: 'بدأت مراجعة البلاغ.' })}><Clock3 />بدء مراجعة البلاغ وتعيينه لي</button>}

              {(detail.accountModeration.suspendedUntil || detail.reporterProtected) && <section className="case-recovery">
                <h3><Unlock />رفع القيود الحالية</h3>
                <p>هذه الإجراءات منفصلة عن حالة البلاغ، لذلك يمكن تنفيذها حتى بعد إغلاقه.</p>
                <div>
                  {detail.accountModeration.suspendedUntil && <button disabled={saving} onClick={() => void saveDecision({ status: detail.status, action: 'restore_account', note: 'تم رفع تعليق الحساب يدويًا من مركز البلاغات.' })}><Unlock /><span><strong>رفع تعليق الحساب الآن</strong><small>السماح بتسجيل الدخول مجددًا فورًا</small></span></button>}
                  {detail.reporterProtected && <button disabled={saving} onClick={() => void saveDecision({ status: detail.status, action: 'restore_contact', note: 'تم رفع حظر الحماية بين الطرفين من مركز البلاغات.' })}><ShieldOff /><span><strong>رفع حظر التواصل</strong><small>إلغاء الحظر الإداري بين الطرفين</small></span></button>}
                </div>
              </section>}

              {detail.status === 'reviewing' ? <section className="case-decision">
                <h3><LockKeyhole />القرار الإداري</h3>
                <label><span>حالة البلاغ بعد الحفظ</span><select value={decisionStatus} onChange={(event) => setDecisionStatus(event.target.value as ReportStatus)}><option value="reviewing">{statusCopy.reviewing.label} — إبقاء الملف مفتوحًا</option><option value="resolved">{statusCopy.resolved.label} — إغلاق بعد ثبوت المخالفة</option><option value="dismissed">{statusCopy.dismissed.label} — إغلاق دون مخالفة</option></select></label>
                <label><span>الإجراء على الحساب</span><select value={action} onChange={(event) => setAction(event.target.value as ModerationAction)}>{availableActions.map((value) => <option key={value} value={value}>{actionCopy[value].label}</option>)}</select><small>{actionCopy[action].hint}</small></label>
                <label><span>ملاحظة القرار</span><textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="اكتب سبب القرار والمعلومات التي راجعتها. ستبقى هذه الملاحظة في السجل الإداري…" /><small>{note.length} / 1000</small></label>
                <button className="button button-primary save-report-decision" disabled={saving || !hasDecisionChange} onClick={() => void saveDecision()}>{saving ? <RefreshCw className="spin" /> : <CheckCircle2 />}{saving ? 'جارٍ التنفيذ…' : 'حفظ القرار وتنفيذ الإجراء'}</button>
              </section> : ['resolved', 'dismissed'].includes(detail.status) ? <section className="case-closed"><ShieldCheck /><span><strong>تم إغلاق هذا البلاغ نهائيًا</strong><small>لا يمكن تغيير حالته أو تطبيق عقوبة جديدة. يمكن فقط رفع قيد سابق من الأعلى.</small></span></section> : null}

              <section className="case-history">
                <h3><History />سجل المعالجة</h3>
                {!detail.history.length && <p className="history-empty">لم تُسجل إجراءات إدارية بعد.</p>}
                {detail.history.map((event) => <article key={event.id}><i /><div><header><strong>{actionCopy[event.action as ModerationAction]?.label ?? event.message}</strong><time>{new Date(event.createdAt).toLocaleString('ar')}</time></header><p>{event.note || event.message}</p><small>{event.admin?.username ?? 'النظام'}{event.statusChanged && event.previousStatus && event.nextStatus ? ` · ${statusCopy[event.previousStatus as ReportStatus]?.label ?? event.previousStatus} ← ${statusCopy[event.nextStatus as ReportStatus]?.label ?? event.nextStatus}` : ''}</small></div></article>)}
              </section>
            </div>
          </>}
        </section>
      </div>
    </div>
  );
}
