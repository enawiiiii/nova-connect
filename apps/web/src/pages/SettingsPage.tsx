import { Bell, ChevronRight, Globe2, LockKeyhole, LogOut, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { InstallPrompt } from '../components/InstallPrompt';
import { PageHeader } from '../components/PageHeader';
import { setLanguage } from '../lib/i18n';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';
import { notificationPermission, requestNotificationPermission, safeStorage } from '../lib/platform';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dark, setDark] = useState(safeStorage.get('nova-theme') !== 'light');
  const [notifications, setNotifications] = useState(notificationPermission() === 'granted');
  const signOut = useAuthStore((state) => state.signOut);
  const reset = useNovaStore((state) => state.reset);
  const toggleNotifications = async () => { const permission = await requestNotificationPermission(); setNotifications(permission === 'granted'); };
  const chooseTheme = (useDark: boolean) => {
    setDark(useDark);
    const theme = useDark ? 'dark' : 'light';
    safeStorage.set('nova-theme', theme);
    document.documentElement.dataset.theme = theme;
  };
  return (
    <div className="page settings-page"><PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="settings-stack">
        <section className="settings-group glass-panel"><div className="section-heading"><span>{t('settings.appearance').toUpperCase()}</span></div><div className="theme-options"><button className={dark ? 'active' : ''} onClick={() => chooseTheme(true)}><span className="theme-preview dark"><Moon /></span><strong>{t('settings.dark')}</strong></button><button className={!dark ? 'active' : ''} onClick={() => chooseTheme(false)}><span className="theme-preview light"><Sun /></span><strong>{t('settings.light')}</strong></button></div></section>
        <section className="settings-group glass-panel"><button className="settings-row" onClick={() => void setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}><span className="setting-icon"><Globe2 /></span><span><strong>{t('settings.language')}</strong><small>{i18n.language === 'ar' ? 'العربية · RTL' : 'English · LTR'}</small></span><em>{i18n.language === 'ar' ? 'English' : 'العربية'} <ChevronRight /></em></button><button className="settings-row" onClick={() => void toggleNotifications()}><span className="setting-icon mint"><Bell /></span><span><strong>{t('settings.notifications')}</strong><small>{t('settings.notifBody')}</small></span><i className={`switch ${notifications ? 'on' : ''}`}><b /></i></button><button className="settings-row" disabled title="Session management is planned for a later version"><span className="setting-icon pink"><LockKeyhole /></span><span><strong>{t('settings.privacy')}</strong><small>{t('settings.privacyBody')}</small></span><em>HTTPS ready</em></button><InstallPrompt /></section>
        <button className="signout-button" onClick={() => { reset(); void signOut().then(() => navigate('/')); }}><LogOut />{t('settings.signout')}</button>
      </div>
    </div>
  );
}
