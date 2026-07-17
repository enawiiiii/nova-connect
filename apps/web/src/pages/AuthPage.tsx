import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Globe2, Mail, RefreshCw, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicUser } from '@nova/shared';
import { Brand } from '../components/Brand';
import { api, ApiError } from '../lib/api';
import { setLanguage } from '../lib/i18n';
import { useAuthStore } from '../stores/auth.store';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [verification, setVerification] = useState<{ email: string; emailSent: boolean; verificationUrl?: string } | null>(null);
  const [values, setValues] = useState({ username: '', email: '', password: '' });
  useEffect(() => {
    setVerification(null);
    setUnverified(false);
    setError('');
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setUnverified(false);
    setLoading(true);
    try {
      if (mode === 'register') {
        const result = await api<{
          user: PublicUser;
          requiresEmailVerification: boolean;
          accessToken?: string;
          emailSent?: boolean;
          verificationUrl?: string;
        }>('/auth/register', {
          method: 'POST',
          body: values,
        });
        if (!result.requiresEmailVerification && result.accessToken) {
          setSession(result.user, result.accessToken);
          navigate('/app/chats');
          return;
        }
        setVerification({
          email: result.user.email ?? values.email,
          emailSent: Boolean(result.emailSent),
          ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
        });
        return;
      }

      const result = await api<{ user: PublicUser; accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { email: values.email, password: values.password },
      });
      setSession(result.user, result.accessToken);
      navigate('/app/chats');
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
      setError(reason instanceof ApiError ? reason.message : 'Could not connect to NOVA. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async (email: string) => {
    setError('');
    setResending(true);
    try {
      const result = await api<{ sent: boolean; verificationUrl?: string }>('/auth/resend-verification', {
        method: 'POST',
        body: { email },
      });
      setVerification({ email, emailSent: result.sent, ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}) });
      setUnverified(false);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'تعذر إعادة إرسال رسالة التحقق.');
    } finally {
      setResending(false);
    }
  };
  return (
    <div className="auth-page">
      <aside className="auth-art"><div className="ambient ambient-one" /><Link className="back-link" to="/"><ArrowLeft /> Back home</Link><div className="auth-quote"><span><Sparkles /> PRIVATE CIRCLES</span><blockquote>“The best conversations don’t need an audience.”</blockquote><p>NOVA gives your closest friendships room to breathe.</p></div><div className="auth-orbit"><i /><i /><i /><span>N</span></div></aside>
      <main className="auth-main">
        <header><Brand /><button className="lang-toggle" onClick={() => void setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}><Globe2 />{i18n.language === 'ar' ? 'English' : 'العربية'}</button></header>
        <div className="auth-card">
          {verification ? (
            <section className="verification-pending" aria-live="polite">
              <span className="verification-icon"><CheckCircle2 /></span>
              <div className="auth-heading">
                <span>EMAIL / VERIFICATION</span>
                <h1>تحقق من بريدك</h1>
                <p>أرسلنا رابط تأكيد الحساب إلى <strong>{verification.email}</strong>. لن تتمكن من تسجيل الدخول قبل التأكيد.</p>
              </div>
              {!verification.emailSent && verification.verificationUrl && <div className="local-verification-note">التجربة المحلية لا تملك خدمة بريد بعد. استخدم الزر التالي لتأكيد الحساب على هذا الجهاز.</div>}
              {!verification.emailSent && !verification.verificationUrl && <div className="form-error">تعذر إرسال الرسالة الآن. تأكد من إعدادات SMTP ثم أعد المحاولة.</div>}
              {verification.verificationUrl && <a className="button button-primary" href={verification.verificationUrl}><Mail />تأكيد الحساب الآن</a>}
              <button className="button verification-resend" type="button" disabled={resending} onClick={() => void resend(verification.email)}>
                <RefreshCw className={resending ? 'spin' : ''} />{resending ? 'جارٍ الإرسال…' : 'إعادة إرسال رابط التحقق'}
              </button>
              {error && <div className="form-error" role="alert">{error}</div>}
              <Link className="verification-login" to="/login">تم التأكيد؟ انتقل إلى تسجيل الدخول</Link>
            </section>
          ) : (
            <>
          <div className="auth-heading"><span>{mode === 'login' ? 'WELCOME / BACK' : 'YOUR ORBIT / AWAITS'}</span><h1>{t(mode === 'login' ? 'auth.welcome' : 'auth.join')}</h1><p>{t(mode === 'login' ? 'auth.loginBody' : 'auth.registerBody')}</p></div>
          {import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true' && <button className="google-button"><b>G</b>{t('auth.google')}</button>}
          {import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true' && <div className="auth-divider"><span>{t('auth.divider')}</span></div>}
          <form onSubmit={submit}>
            {mode === 'register' && <label><span>{t('auth.username')}</span><input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" title="استخدم الأحرف الإنجليزية والأرقام والشرطة السفلية فقط" autoComplete="username" value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} placeholder="your_nova_name" /></label>}
            <label><span>{t('auth.email')}</span><input required type="email" maxLength={254} autoComplete="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} placeholder="you@example.com" /></label>
            <label><span>{t('auth.password')}</span><div className="password-input"><input required minLength={8} maxLength={128} pattern={mode === 'register' ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}' : undefined} title={mode === 'register' ? 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم' : undefined} type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="••••••••••••" /><button type="button" onClick={() => setVisible((value) => !value)} aria-label="Toggle password visibility">{visible ? <EyeOff /> : <Eye />}</button></div></label>
            {mode === 'register' && <small className="password-hint">8+ characters · uppercase · lowercase · number</small>}
            {error && <div className="form-error" role="alert">{error}</div>}
            {unverified && <button className="button verification-resend" type="button" disabled={resending} onClick={() => void resend(values.email)}><RefreshCw />إعادة إرسال رابط التحقق</button>}
            <button className="button button-primary submit-button" disabled={loading}>{loading ? 'Connecting…' : t(mode === 'login' ? 'auth.login' : 'auth.register')}<ArrowRight /></button>
          </form>
          <p className="auth-switch">{t(mode === 'login' ? 'auth.noAccount' : 'auth.hasAccount')} <Link to={mode === 'login' ? '/register' : '/login'}>{t(mode === 'login' ? 'auth.create' : 'auth.signIn')}</Link></p>
            </>
          )}
        </div>
        <p className="auth-legal">By continuing, you agree to our Terms and Privacy Policy.</p>
      </main>
    </div>
  );
}
