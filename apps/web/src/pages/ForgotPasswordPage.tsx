import { CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (token) {
        if (password !== confirm) throw new Error('كلمتا المرور غير متطابقتين.');
        await api('/auth/reset-password', { method: 'POST', body: { token, password } });
        setMessage('تم تغيير كلمة المرور وإغلاق الجلسات القديمة. يمكنك تسجيل الدخول الآن.');
      } else {
        const result = await api<{ sent?: boolean; resetUrl?: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
        setMessage('إذا كان البريد مسجلاً، ستصلك رسالة استعادة خلال دقائق.');
        if (result.resetUrl) window.setTimeout(() => { window.location.href = result.resetUrl!; }, 700);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إكمال العملية.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="simple-page">
      <Brand />
      <section className="simple-card glass-panel password-recovery">
        {message ? <CheckCircle2 className="success" /> : token ? <KeyRound /> : <Mail />}
        <h1>{token ? 'كلمة مرور جديدة' : 'استعادة كلمة المرور'}</h1>
        <p>{token ? 'اختر كلمة قوية. سيُسجّل خروج الحساب من كل الأجهزة القديمة لحمايتك.' : 'أدخل بريدك وسنرسل رابطاً صالحاً لمدة ساعة واحدة.'}</p>
        {!message && <form onSubmit={submit}>
          {!token ? <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /> : <>
            <input required type="password" minLength={8} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="كلمة المرور الجديدة" />
            <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="تأكيد كلمة المرور" />
          </>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary" disabled={loading}>{loading ? 'جارٍ التنفيذ…' : token ? 'حفظ كلمة المرور' : 'إرسال رابط الاستعادة'}</button>
        </form>}
        {message && <p className="recovery-success">{message}</p>}
        <Link to="/login">العودة إلى تسجيل الدخول</Link>
      </section>
    </main>
  );
}
