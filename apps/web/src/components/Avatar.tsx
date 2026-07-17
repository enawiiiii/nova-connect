import type { PublicUser } from '@nova/shared';
import { useEffect, useState } from 'react';

const hues = ['from-violet-500 to-fuchsia-400', 'from-cyan-400 to-blue-500', 'from-amber-300 to-orange-500', 'from-emerald-300 to-teal-500', 'from-rose-400 to-violet-500'];

export function Avatar({ user, size = 'md', showStatus = false }: { user: Pick<PublicUser, 'username' | 'avatar' | 'status'>; size?: 'sm' | 'md' | 'lg' | 'xl'; showStatus?: boolean }) {
  const color = hues[user.username.charCodeAt(0) % hues.length];
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [user.avatar]);
  return (
    <span className={`avatar avatar-${size} bg-gradient-to-br ${color}`} aria-label={`${user.username}, ${user.status}`}>
      {user.avatar && !imageFailed ? <img src={user.avatar} alt="" onError={() => setImageFailed(true)} /> : <span>{user.username.slice(0, 2).toUpperCase()}</span>}
      {showStatus && <i className={`presence presence-${user.status}`} />}
    </span>
  );
}
