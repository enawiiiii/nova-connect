import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="NOVA Connect home">
      <span className="brand-orbit" aria-hidden="true"><span>N</span><i /></span>
      {!compact && <span className="font-display text-lg font-bold tracking-tight">NOVA <b className="font-medium text-white/45">Connect</b></span>}
    </Link>
  );
}
