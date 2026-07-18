import type { PublicUser } from '@nova/shared';
import { KeyRound, ShieldCheck, Smartphone, Unlock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

interface DeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
}

export function SecuritySettings() {
  const token = useAuthStore((state) => state.accessToken);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const reload = useCallback(async () => {
    if (!token) return;
    const [deviceSessions, blockedUsers] = await Promise.all([
      api<DeviceSession[]>('/auth/sessions', { token }),
      api<PublicUser[]>('/privacy/blocked', { token }),
    ]);
    setSessions(deviceSessions);
    setBlocked(blockedUsers);
  }, [token]);
  useEffect(() => { void reload().catch(() => setMessage('تعذر تحميل إعدادات الأمان.')); }, [reload]);

  const changePassword = async () => {
    if (!token) return;
    try {
      await api('/auth/change-password', { method: 'POST', token, body: passwords });
      setPasswords({ currentPassword: '', newPassword: '' });
      setMessage('تم تغيير كلمة المرور.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور.');
    }
  };
  const setupTwoFactor = async () => {
    if (!token) return;
    try {
      setTotp(await api<{ secret: string; uri: string }>('/auth/2fa/setup', { method: 'POST', token }));
      setMessage('أضف المفتاح إلى تطبيق المصادقة ثم أدخل الرمز.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر إعداد المصادقة الثنائية.'); }
  };
  const confirmTwoFactor = async () => {
    if (!token) return;
    try {
      await api('/auth/2fa/enable', { method: 'POST', token, body: { code } });
      setTotp(null);
      setCode('');
      setMessage('تم تفعيل المصادقة الثنائية.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'الرمز غير صحيح.'); }
  };

  return (
    <section className="settings-group glass-panel security-settings">
      <div className="section-heading"><span>الأمان والخصوصية</span></div>
      {message && <div className="security-message">{message}</div>}
      <div className="security-block"><h3><KeyRound />تغيير كلمة المرور</h3><div className="security-inline"><input type="password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} placeholder="كلمة المرور الحالية" /><input type="password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} placeholder="كلمة المرور الجديدة" /><button disabled={!passwords.currentPassword || passwords.newPassword.length < 8} onClick={() => void changePassword()}>تغيير</button></div></div>
      <div className="security-block"><h3><ShieldCheck />المصادقة الثنائية</h3>{!totp ? <button onClick={() => void setupTwoFactor()}>إعداد تطبيق المصادقة</button> : <div className="totp-setup"><p>المفتاح: <code>{totp.secret}</code></p><a href={totp.uri}>فتح تطبيق المصادقة</a><div className="security-inline"><input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="رمز من 6 أرقام" /><button disabled={code.length !== 6} onClick={() => void confirmTwoFactor()}>تفعيل</button></div></div>}</div>
      <div className="security-block"><h3><Smartphone />الأجهزة المسجلة</h3>{sessions.map((session) => <div className="session-row" key={session.id}><span><strong>{session.userAgent?.includes('iPhone') ? 'iPhone / Safari' : session.userAgent?.slice(0, 70) || 'جهاز مسجل'}</strong><small>{session.ipAddress ?? 'IP غير متاح'} · {new Date(session.lastUsedAt).toLocaleString()}</small></span><button onClick={() => void api(`/auth/sessions/${session.id}`, { method: 'DELETE', token }).then(reload)}>تسجيل خروج</button></div>)}</div>
      {blocked.length > 0 && <div className="security-block"><h3><Unlock />المستخدمون المحظورون</h3>{blocked.map((user) => <div className="session-row" key={user.id}><strong>{user.username}</strong><button onClick={() => void api(`/privacy/block/${user.id}`, { method: 'DELETE', token }).then(reload)}>إلغاء الحظر</button></div>)}</div>}
    </section>
  );
}
