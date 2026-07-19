import { MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

export function VerifyEmailPage() {
  return (
    <div className="simple-page">
      <Brand />
      <div className="simple-card glass-panel">
        <MailCheck className="success" />
        <h1>التأكيد أصبح أكثر أمانًا</h1>
        <p>يستخدم NOVA الآن رمزًا من 6 أرقام بدل روابط التأكيد. ارجع إلى تسجيل الدخول، ثم اطلب رمزًا جديدًا لبريدك.</p>
        <Link className="button button-primary" to="/login">العودة إلى تسجيل الدخول</Link>
      </div>
    </div>
  );
}
