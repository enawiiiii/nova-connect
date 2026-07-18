import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

export function Brand({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const destination = user ? '/app/chats' : '/login';
  return (
    <Link to={destination} className="brand" aria-label="NOVA Connect home">
      <span className="brand-orbit" aria-hidden="true"><span>N</span><i /></span>
      {!compact && <span className="font-display text-lg font-bold tracking-tight">NOVA <b className="font-medium text-white/45">Connect</b></span>}
    </Link>
  );
}
