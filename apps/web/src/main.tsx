import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { primeCallAudio } from './lib/call-sounds';
import './lib/i18n';
import { safeStorage } from './lib/platform';
import { installGlobalErrorMonitoring } from './lib/monitoring';
import './styles.css';
import './styles-app.css';
import './styles-more.css';

document.documentElement.dataset.theme = safeStorage.get('nova-theme') === 'light' ? 'light' : 'dark';
primeCallAudio();
installGlobalErrorMonitoring();
if (import.meta.env.DEV) {
  void navigator.serviceWorker?.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => { void updateSW(true); },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration.update();
      };
      window.setInterval(checkForUpdate, 60_000);
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
    },
  });
}
createRoot(document.getElementById('root')!).render(<StrictMode><AppErrorBoundary><BrowserRouter><App /></BrowserRouter></AppErrorBoundary></StrictMode>);
