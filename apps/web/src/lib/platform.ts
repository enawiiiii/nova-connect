export function createId() {
  const secureCrypto = globalThis.crypto;
  if (typeof secureCrypto?.randomUUID === 'function') {
    try { return secureCrypto.randomUUID(); } catch { /* Fall through for insecure Safari contexts. */ }
  }

  const bytes = new Uint8Array(16);
  if (typeof secureCrypto?.getRandomValues === 'function') secureCrypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const safeStorage = {
  get(key: string) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key: string, value: string) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* Preferences remain in memory. */ }
  },
};

export const notificationsSupported = () => typeof globalThis.Notification !== 'undefined';
export const notificationPermission = () => notificationsSupported() ? Notification.permission : 'denied';

export async function requestNotificationPermission() {
  return notificationsSupported() ? Notification.requestPermission() : 'denied';
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}
