import { api } from './api';

export interface PushCapability {
  supported: boolean;
  enabled: boolean;
  subscribed: boolean;
  reason?: string;
}

function supportsPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function decodeApplicationKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function pushCapability(token: string): Promise<PushCapability> {
  if (!supportsPush()) return { supported: false, enabled: false, subscribed: false, reason: 'هذا المتصفح لا يدعم إشعارات الخلفية.' };
  const config = await api<{ enabled: boolean; publicKey: string | null }>('/push/config', { token });
  if (!config.enabled || !config.publicKey) return { supported: true, enabled: false, subscribed: false, reason: 'مفتاح إشعارات الخادم لم يُضبط بعد.' };
  const registration = await navigator.serviceWorker.ready;
  return { supported: true, enabled: true, subscribed: Boolean(await registration.pushManager.getSubscription()) };
}

export async function enablePush(token: string) {
  if (!supportsPush()) throw new Error('إشعارات الخلفية غير مدعومة على هذا الجهاز.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('يجب السماح بالإشعارات من إعدادات الجهاز.');
  const config = await api<{ enabled: boolean; publicKey: string | null }>('/push/config', { token });
  if (!config.enabled || !config.publicKey) throw new Error('إعداد إشعارات الخادم غير مكتمل.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationKey(config.publicKey),
  });
  await api('/push/subscribe', { method: 'POST', token, body: { subscription: subscription.toJSON() } });
  return true;
}

export async function ensurePushSubscription(token: string) {
  if (!supportsPush() || Notification.permission !== 'granted') return false;
  try {
    return await enablePush(token);
  } catch {
    return false;
  }
}

export async function disablePush(token: string) {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api('/push/subscribe', { method: 'DELETE', token, body: { endpoint: subscription.endpoint } }).catch(() => undefined);
  await subscription.unsubscribe();
}

export async function dismissPushTag(tag: string) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'NOVA_DISMISS_NOTIFICATION', tag });
}
