import { Link } from 'react-router-dom';
import { product } from '../config/product';
import { useAuthStore } from '../stores/auth.store';

export function Brand({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const destination = user ? '/app/chats' : '/login';
  return (
    <Link to={destination} className="brand" aria-label={`${product.name} home`}>
      <span className="brand-orbit" aria-hidden="true"><span>{product.mark}</span><i /></span>
      {!compact && <span className="font-display text-lg font-bold tracking-tight">{product.name}</span>}
    </Link>
  );
}
