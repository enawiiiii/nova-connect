import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const verificationStarted = useRef(false);
  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    const token = params.get('token');
    if (!token) return setState('error');
    void api('/auth/verify-email', { method: 'POST', body: { token } }).then(() => setState('success')).catch(() => setState('error'));
  }, [params]);
  return <div className="simple-page"><Brand /><div className="simple-card glass-panel">{state === 'loading' ? <LoaderCircle className="spin" /> : state === 'success' ? <CheckCircle2 className="success" /> : <XCircle className="error" />}<h1>{state === 'loading' ? 'جارٍ تأكيد البريد…' : state === 'success' ? 'تم تأكيد البريد' : 'الرابط غير صالح'}</h1><p>{state === 'success' ? 'حساب NOVA أصبح جاهزاً. يمكنك تسجيل الدخول الآن.' : state === 'error' ? 'رابط التحقق غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من صفحة تسجيل الدخول.' : 'سيستغرق هذا لحظات قليلة.'}</p>{state !== 'loading' && <Link className="button button-primary" to="/login">{state === 'success' ? 'تسجيل الدخول' : 'العودة إلى تسجيل الدخول'}</Link>}</div></div>;
}
