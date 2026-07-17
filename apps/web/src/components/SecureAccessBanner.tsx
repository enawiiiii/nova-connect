import { ExternalLink, ShieldCheck } from 'lucide-react';
import { secureVersionUrl } from '../lib/secure-url';

export function SecureAccessBanner() {
  const target = secureVersionUrl();
  if (window.isSecureContext || !target) return null;
  return (
    <aside className="secure-access-banner" role="alert">
      <ShieldCheck />
      <span><strong>تشغيل الكاميرا والميكروفون على iPhone</strong><small>أنت تستخدم HTTP. افتح نسخة HTTPS الآمنة ثم سجّل الدخول مرة واحدة.</small></span>
      <a href={target}>فتح النسخة الآمنة <ExternalLink /></a>
    </aside>
  );
}
