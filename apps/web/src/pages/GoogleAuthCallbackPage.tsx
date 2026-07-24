import { ArrowLeft, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PublicUser } from '@nova/shared';
import { Brand } from '../components/Brand';
import { product } from '../config/product';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

const errorMessages: Record<string, string> = {
  GOOGLE_CSRF_INVALID: 'تعذر التحقق من أمان طلب Google. أعد المحاولة من صفحة تسجيل الدخول.',
  GOOGLE_CREDENTIAL_INVALID: 'لم يرسل Google بيانات دخول صالحة. أعد المحاولة.',
  GOOGLE_AUTH_DISABLED: 'تسجيل الدخول عبر Google غير مفعّل حاليًا.',
  GOOGLE_AUTH_FAILED: 'تعذر إكمال تسجيل الدخول عبر Google.',
  ACCOUNT_LINK_REQUIRED: `يوجد حساب ${product.shortName} بهذا البريد. سجّل الدخول بكلمة المرور أولًا قبل ربط Google.`,
  GOOGLE_ACCOUNT_CONFLICT: 'هذا البريد مرتبط بحساب Google مختلف.',
  ACCOUNT_SUSPENDED: 'هذا الحساب موقوف حاليًا.',
};

export function GoogleAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const status = params.get('status');
  const errorCode = params.get('error');

  useEffect(() => {
    if (status !== 'complete' || !ready) return;
    if (user) navigate('/app/chats', { replace: true });
    else setLocalError('تمت العودة من Google لكن تعذر إنشاء الجلسة. أعد المحاولة.');
  }, [navigate, ready, status, user]);

  const submitTotp = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(totpCode)) return;
    setSubmitting(true);
    setLocalError('');
    try {
      const result = await api<{ user: PublicUser; accessToken: string }>('/auth/google/redirect/totp', {
        method: 'POST',
        body: { code: totpCode },
      });
      setSession(result.user, result.accessToken);
      navigate('/app/chats', { replace: true });
    } catch (reason) {
      setLocalError(reason instanceof ApiError ? reason.message : 'تعذر التحقق من رمز المصادقة الثنائية.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || (errorCode ? errorMessages[errorCode] ?? 'تعذر إكمال تسجيل الدخول عبر Google.' : '');
  const waiting = status === 'complete' && !displayedError;

  return (
    <div className="google-callback-page">
      <div className="google-callback-orbit" aria-hidden="true"><i /><i /><span>{product.mark}</span></div>
      <section className="google-callback-card glass-panel" aria-live="polite">
        <Brand />
        {status === 'two-factor' ? (
          <>
            <span className="google-callback-icon"><ShieldCheck /></span>
            <p className="eyebrow">GOOGLE / TWO-FACTOR</p>
            <h1>خطوة أمان أخيرة</h1>
            <p>أدخل رمز المصادقة الثنائية الخاص بحساب {product.shortName} لإكمال الدخول.</p>
            <form onSubmit={submitTotp}>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                aria-label="رمز المصادقة الثنائية"
              />
              {displayedError && <div className="form-error" role="alert">{displayedError}</div>}
              <button className="button button-primary" disabled={submitting || totpCode.length !== 6}>
                {submitting ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
                {submitting ? 'جارٍ التحقق…' : 'إكمال تسجيل الدخول'}
              </button>
            </form>
          </>
        ) : waiting ? (
          <>
            <span className="google-callback-icon"><LoaderCircle className="spin" /></span>
            <p className="eyebrow">GOOGLE / SECURE RETURN</p>
            <h1>جارٍ فتح مدارك…</h1>
            <p>تم اختيار الحساب. نتحقق من الجلسة ونعيدك إلى {product.shortName} الآن.</p>
          </>
        ) : (
          <>
            <span className="google-callback-icon error"><ShieldCheck /></span>
            <p className="eyebrow">GOOGLE / SIGN-IN</p>
            <h1>لم يكتمل تسجيل الدخول</h1>
            <p className="google-callback-error" role="alert">{displayedError || 'طلب تسجيل الدخول غير مكتمل.'}</p>
            <Link className="button button-primary" to="/login"><ArrowLeft />العودة والمحاولة مجددًا</Link>
          </>
        )}
      </section>
    </div>
  );
}
