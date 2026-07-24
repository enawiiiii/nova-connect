import type { PublicUser } from '@nova/shared';
import { create } from 'zustand';
import { api, ApiError, configureApiAuth } from '../lib/api';
import { updateSocketToken } from '../lib/socket';

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  ready: boolean;
  demo: boolean;
  setSession: (user: PublicUser, accessToken: string) => void;
  updateUser: (user: PublicUser) => void;
  enterDemo: () => void;
  bootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const demoMe: PublicUser = {
  id: 'c55467b0-3e1b-4207-a030-d85896754151',
  username: 'Noor',
  email: 'noor@example.com',
  avatar: null,
  bio: 'Product designer · night thinker · always one playlist away',
  status: 'online',
  lastSeen: new Date().toISOString(),
};

let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  ready: false,
  demo: false,
  setSession: (user, accessToken) => set({ user, accessToken, demo: false, ready: true }),
  updateUser: (user) => set({ user }),
  enterDemo: () => set({ user: demoMe, accessToken: null, demo: true, ready: true }),
  bootstrap: async () => {
    if (get().ready) return;
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      let retryDelay = 350;
      while (!get().ready) {
        try {
          const { accessToken } = await api<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
          const user = await api<PublicUser>('/users/me', { token: accessToken });
          set({ user, accessToken, ready: true });
          return;
        } catch (reason) {
          if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
            set({ user: null, accessToken: null, ready: true });
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
          retryDelay = Math.min(retryDelay * 2, 4_000);
        }
      }
    })().finally(() => { bootstrapPromise = null; });
    return bootstrapPromise;
  },
  signOut: async () => {
    if (!get().demo) await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    set({ user: null, accessToken: null, demo: false, ready: true });
    window.dispatchEvent(new Event('nova:session-ended'));
  },
}));

configureApiAuth({
  onAccessToken: (accessToken) => {
    updateSocketToken(accessToken);
    useAuthStore.setState({ accessToken });
  },
  onUnauthorized: () => {
    useAuthStore.setState({ user: null, accessToken: null, demo: false, ready: true });
    window.dispatchEvent(new Event('nova:session-ended'));
  },
});
