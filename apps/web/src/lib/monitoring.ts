import { api } from './api';
import { useAuthStore } from '../stores/auth.store';

export function reportClientError(error: unknown, details: Record<string, unknown> = {}) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  void api('/monitoring/client-errors', {
    method: 'POST',
    token,
    body: {
      message: normalized.message.slice(0, 1000),
      path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      details: { ...details, name: normalized.name, stack: normalized.stack?.slice(0, 4000) },
    },
  }).catch(() => undefined);
}

export function installGlobalErrorMonitoring() {
  window.addEventListener('error', (event) => reportClientError(event.error ?? event.message, { kind: 'window-error' }));
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason, { kind: 'unhandled-rejection' }));
}
