import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { primeCallAudio } from './lib/call-sounds';
import './lib/i18n';
import { safeStorage } from './lib/platform';
import './styles.css';
import './styles-app.css';
import './styles-more.css';

document.documentElement.dataset.theme = safeStorage.get('nova-theme') === 'light' ? 'light' : 'dark';
primeCallAudio();
if (import.meta.env.DEV) {
  void navigator.serviceWorker?.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
} else {
  registerSW({ immediate: true });
}
createRoot(document.getElementById('root')!).render(<StrictMode><AppErrorBoundary><BrowserRouter><App /></BrowserRouter></AppErrorBoundary></StrictMode>);
