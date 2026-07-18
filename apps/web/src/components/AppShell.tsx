import { Bell, MessageCircle, Phone, Settings, UserRound, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';
import { Avatar } from './Avatar';
import { Brand } from './Brand';
import { IncomingCallOverlay } from '../features/calls/IncomingCallOverlay';
import { ensurePushSubscription } from '../lib/push';

export function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user)!;
  const accessToken = useAuthStore((state) => state.accessToken);
  const { load, notifications, markNotificationsRead } = useNovaStore();
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoadError('');
    void load().catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'تعذر تحميل بيانات التطبيق.');
    });
    return () => { active = false; };
  }, [load, retryKey]);
  useEffect(() => {
    if (accessToken) void ensurePushSubscription(accessToken);
  }, [accessToken]);
  const nav = [
    { to: '/app/chats', icon: MessageCircle, label: t('nav.chats') },
    { to: '/app/friends', icon: UsersRound, label: t('nav.friends') },
    { to: '/app/calls', icon: Phone, label: t('nav.calls') },
    { to: '/app/profile', icon: UserRound, label: t('nav.profile') },
    { to: '/app/settings', icon: Settings, label: t('nav.settings') },
  ];
  const unread = notifications.filter((item) => !item.read).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand compact /></div>
        <nav aria-label="Main navigation">
          {nav.map(({ to, icon: Icon, label }) => <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon size={21} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-bottom"><NavLink to="/app/profile" aria-label="Your profile"><Avatar user={user} size="sm" showStatus /></NavLink></div>
      </aside>

      <header className="topbar">
        <div className="mobile-brand"><Brand /></div>
        <span className="topbar-status"><i /> {t('common.online')}</span>
        <div className="notification-wrap">
          <button className="icon-button" onClick={() => { setOpen((value) => !value); if (!open) void markNotificationsRead().catch(() => undefined); }} aria-label="Notifications"><Bell size={19} />{unread > 0 && <b>{unread}</b>}</button>
          {open && <div className="notification-popover glass-panel"><div className="popover-title">Signal feed</div>{notifications.length ? notifications.slice(0, 5).map((item) => <div className="notification-item" key={item.id}><i /><div><strong>{item.content}</strong><span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div>) : <p className="muted p-4">All quiet in your orbit.</p>}</div>}
        </div>
        <Avatar user={user} size="sm" />
      </header>

      <main className="app-main">
        {loadError && <div className="app-load-error" role="alert"><span>{loadError}</span><button onClick={() => setRetryKey((value) => value + 1)}>إعادة المحاولة</button></div>}
        <Outlet />
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(({ to, icon: Icon, label }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} /><span>{label}</span></NavLink>)}</nav>
      <IncomingCallOverlay />
    </div>
  );
}
