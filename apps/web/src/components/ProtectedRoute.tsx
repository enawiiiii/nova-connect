import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

export function ProtectedRoute() {
  const { user, ready } = useAuthStore();
  if (!ready) return <div className="splash"><span className="brand-orbit"><span>N</span><i /></span><p>جارٍ استعادة جلستك والاتصال بـ NOVA…</p></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
