import { Download, Link2, QrCode, Share2, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { product } from '../config/product';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';

interface Controls {
  showLastSeen: boolean;
  showAvatar: boolean;
  allowFriendRequests: boolean;
}

export function AccountSettings() {
  const navigate = useNavigate();
  const { user, accessToken, signOut } = useAuthStore();
  const reset = useNovaStore((state) => state.reset);
  const [controls, setControls] = useState<Controls>({ showLastSeen: true, showAvatar: true, allowFriendRequests: true });
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [password, setPassword] = useState('');
  const inviteUrl = useMemo(() => `${window.location.origin}/register?invite=${encodeURIComponent(user?.username ?? '')}`, [user?.username]);

  useEffect(() => {
    if (!accessToken) return;
    void api<Controls>('/users/me/account', { token: accessToken }).then(setControls).catch((error) => setMessage(error instanceof Error ? error.message : 'تعذر تحميل إعدادات الحساب.'));
  }, [accessToken]);
  useEffect(() => {
    void QRCode.toDataURL(inviteUrl, { width: 220, margin: 1, color: { dark: '#0b0d16', light: '#ffffff' } }).then(setQr);
  }, [inviteUrl]);

  const updateControl = async (key: keyof Controls) => {
    if (!accessToken) return;
    const previous = controls;
    const next = { ...controls, [key]: !controls[key] };
    setControls(next);
    try {
      setControls(await api<Controls>('/users/me/account', { method: 'PATCH', token: accessToken, body: { [key]: next[key] } }));
      setMessage('تم حفظ إعدادات الخصوصية.');
    } catch (error) {
      setControls(previous);
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات.');
    }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setMessage('تم نسخ رابط الدعوة.');
  };

  const shareInvite = async () => {
    if (navigator.share) await navigator.share({ title: product.name, text: `انضم إليّ على ${product.shortName} باسم ${user?.username}`, url: inviteUrl });
    else await copyInvite();
  };

  const exportData = async () => {
    if (!accessToken) return;
    const data = await api<unknown>('/users/me/export', { token: accessToken });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${product.shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'account'}-account-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('تم تجهيز نسخة بياناتك.');
  };

  const deleteAccount = async () => {
    if (!accessToken || !password) return;
    try {
      await api('/users/me', { method: 'DELETE', token: accessToken, body: { password } });
      reset();
      await signOut();
      navigate('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حذف الحساب.');
    }
  };

  return (
    <>
      <section className="settings-group glass-panel account-settings">
        <div className="section-heading"><span>الدعوة والخصوصية</span></div>
        <div className="invite-card">
          <div>{qr ? <img src={qr} alt={`رمز QR لدعوة ${product.shortName}`} /> : <QrCode />}</div>
          <span><strong>دعوتك الشخصية</strong><small>{inviteUrl}</small></span>
          <button onClick={() => void copyInvite()}><Link2 />نسخ</button>
          <button onClick={() => void shareInvite()}><Share2 />مشاركة</button>
        </div>
        <button className="settings-row" onClick={() => void updateControl('showLastSeen')}><span><strong>إظهار آخر ظهور</strong><small>السماح للآخرين بمعرفة آخر وقت كنت فيه متصلاً.</small></span><i className={`switch ${controls.showLastSeen ? 'on' : ''}`}><b /></i></button>
        <button className="settings-row" onClick={() => void updateControl('showAvatar')}><span><strong>إظهار صورة البروفايل</strong><small>إظهار صورتك للأشخاص الآخرين.</small></span><i className={`switch ${controls.showAvatar ? 'on' : ''}`}><b /></i></button>
        <button className="settings-row" onClick={() => void updateControl('allowFriendRequests')}><span><strong>السماح بطلبات الصداقة</strong><small>إظهار حسابك في البحث واستقبال طلبات جديدة.</small></span><i className={`switch ${controls.allowFriendRequests ? 'on' : ''}`}><b /></i></button>
        <button className="settings-row" onClick={() => void exportData()}><span className="setting-icon mint"><Download /></span><span><strong>تصدير بياناتي</strong><small>تنزيل نسخة JSON من ملفك ورسائلك ومكالماتك ومجموعاتك.</small></span></button>
        {message && <p className="settings-message">{message}</p>}
      </section>
      <section className="settings-group glass-panel danger-zone">
        <div className="section-heading"><span>منطقة خطرة</span></div>
        {!deleteMode ? <button className="settings-row danger" onClick={() => setDeleteMode(true)}><span className="setting-icon pink"><Trash2 /></span><span><strong>حذف الحساب نهائياً</strong><small>لا يمكن التراجع عن هذه العملية.</small></span></button> : <div className="delete-account-form"><p>أدخل كلمة المرور للتأكيد.</p><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><div><button onClick={() => setDeleteMode(false)}>إلغاء</button><button className="danger" disabled={!password} onClick={() => void deleteAccount()}>حذف نهائي</button></div></div>}
      </section>
    </>
  );
}
