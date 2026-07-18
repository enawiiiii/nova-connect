import { Activity, AlertTriangle, Flag, MessageCircle, Phone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

interface Overview { users: number; onlineUsers: number; messages: number; calls: number; openReports: number; errors24h: number }
interface ReportItem { id: string; reason: string; details: string | null; status: string; created_at: string; reporter?: { username: string }; reported?: { username: string } }
interface EventItem { id: string; level: string; source: string; message: string; path: string | null; created_at: string }

export function AdminPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [errors, setErrors] = useState<EventItem[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    if (!accessToken) return;
    setError('');
    try {
      const [nextOverview, nextReports, nextErrors] = await Promise.all([
        api<Overview>('/admin/overview', { token: accessToken }),
        api<ReportItem[]>('/admin/reports', { token: accessToken }),
        api<EventItem[]>('/admin/errors', { token: accessToken }),
      ]);
      setOverview(nextOverview);
      setReports(nextReports);
      setErrors(nextErrors);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل لوحة الإدارة.');
    }
  };
  useEffect(() => { void load(); }, [accessToken]);

  const updateReport = async (id: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    if (!accessToken) return;
    await api(`/admin/reports/${id}`, { method: 'PATCH', token: accessToken, body: { status } });
    await load();
  };

  const metrics = overview ? [
    { label: 'المستخدمون', value: overview.users, icon: Users },
    { label: 'متصل الآن', value: overview.onlineUsers, icon: Activity },
    { label: 'الرسائل', value: overview.messages, icon: MessageCircle },
    { label: 'المكالمات', value: overview.calls, icon: Phone },
    { label: 'بلاغات مفتوحة', value: overview.openReports, icon: Flag },
    { label: 'أخطاء خلال 24 ساعة', value: overview.errors24h, icon: AlertTriangle },
  ] : [];

  return (
    <div className="page admin-page">
      <PageHeader title="إدارة NOVA" subtitle="مراقبة الصحة التشغيلية والبلاغات دون الاطلاع على محتوى المحادثات" />
      {error && <div className="call-page-error" role="alert">{error}</div>}
      {overview && <>
        <section className="admin-metrics">{metrics.map(({ label, value, icon: Icon }) => <article className="glass-panel" key={label}><Icon /><span>{label}</span><strong>{value.toLocaleString()}</strong></article>)}</section>
        <div className="admin-columns">
          <section className="glass-panel admin-panel"><div className="section-heading"><span>البلاغات</span><b>{reports.length}</b></div>{reports.length ? reports.map((report) => <article className="admin-item" key={report.id}><header><strong>{report.reason}</strong><em>{report.status}</em></header><p>{report.details || 'لا توجد تفاصيل إضافية'}</p><small>{report.reporter?.username ?? report.id.slice(0, 8)} ← {report.reported?.username ?? 'مستخدم'} · {new Date(report.created_at).toLocaleString()}</small><footer><button onClick={() => void updateReport(report.id, 'reviewing')}>مراجعة</button><button onClick={() => void updateReport(report.id, 'resolved')}>تم الحل</button><button onClick={() => void updateReport(report.id, 'dismissed')}>تجاهل</button></footer></article>) : <p className="admin-empty">لا توجد بلاغات.</p>}</section>
          <section className="glass-panel admin-panel"><div className="section-heading"><span>أخطاء النظام</span><b>{errors.length}</b></div>{errors.length ? errors.map((item) => <article className="admin-item error" key={item.id}><header><strong>{item.source}</strong><em>{item.level}</em></header><p>{item.message}</p><small>{item.path || 'خادم API'} · {new Date(item.created_at).toLocaleString()}</small></article>) : <p className="admin-empty">لا توجد أخطاء مسجلة.</p>}</section>
        </div>
      </>}
    </div>
  );
}
