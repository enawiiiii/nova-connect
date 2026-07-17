import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const listener = (value: Event) => { value.preventDefault(); setEvent(value as InstallEvent); };
    window.addEventListener('beforeinstallprompt', listener);
    return () => window.removeEventListener('beforeinstallprompt', listener);
  }, []);
  const install = async () => { if (!event) return; await event.prompt(); if ((await event.userChoice).outcome === 'accepted') setEvent(null); };
  if (compact) return event ? <button className="button button-ghost" onClick={install}><Download size={17} />{t('settings.installAction')}</button> : null;
  return <button className="settings-row" onClick={install} disabled={!event}><span className="setting-icon"><Download /></span><span><strong>{t('settings.install')}</strong><small>{t('settings.installBody')}</small></span><em>{event ? t('settings.installAction') : 'PWA ready'}</em></button>;
}
