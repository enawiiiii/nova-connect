import crypto from 'node:crypto';
import webpush, { type PushSubscription } from 'web-push';
import { env, isLocalDevelopment } from '../config/env.js';
import { db } from '../database/supabase.js';
import { localDb } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: 'message' | 'call' | 'friend' | 'system';
  badge?: number;
}

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export const pushService = {
  config() {
    return { enabled: configured, publicKey: configured ? env.VAPID_PUBLIC_KEY : null };
  },

  async subscribe(userId: string, subscription: PushSubscription, userAgent?: string) {
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;
    if (!subscription.endpoint || !p256dh || !auth) throw new AppError(422, 'Push subscription is incomplete', 'INVALID_PUSH_SUBSCRIPTION');
    const now = new Date().toISOString();
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        const existing = state.pushSubscriptions.find((item) => item.endpoint === subscription.endpoint);
        if (existing) {
          existing.user_id = userId;
          existing.p256dh = p256dh;
          existing.auth = auth;
          existing.user_agent = userAgent?.slice(0, 500) ?? null;
          existing.updated_at = now;
        } else {
          state.pushSubscriptions.push({
            id: crypto.randomUUID(),
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            user_agent: userAgent?.slice(0, 500) ?? null,
            created_at: now,
            updated_at: now,
          });
        }
      });
      return;
    }
    const { error } = await db.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: userAgent?.slice(0, 500) ?? null,
      updated_at: now,
    }, { onConflict: 'endpoint' });
    if (error) throw new AppError(500, 'Could not save push subscription', 'PUSH_SUBSCRIBE_FAILED');
  },

  async unsubscribe(userId: string, endpoint: string) {
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        state.pushSubscriptions = state.pushSubscriptions.filter((item) => item.user_id !== userId || item.endpoint !== endpoint);
      });
      return;
    }
    const { error } = await db.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
    if (error) throw new AppError(500, 'Could not remove push subscription', 'PUSH_UNSUBSCRIBE_FAILED');
  },

  async send(userId: string, message: PushMessage) {
    if (!configured) return;
    const subscriptions = isLocalDevelopment
      ? await localDb.read((state) => state.pushSubscriptions.filter((item) => item.user_id === userId))
      : ((await db.from('push_subscriptions').select('*').eq('user_id', userId)).data ?? []);
    await Promise.all(subscriptions.map(async (stored) => {
      try {
        await webpush.sendNotification({
          endpoint: String(stored.endpoint),
          keys: { p256dh: String(stored.p256dh), auth: String(stored.auth) },
        }, JSON.stringify(message), { TTL: message.kind === 'call' ? 60 : 86_400, urgency: message.kind === 'call' ? 'high' : 'normal' });
      } catch (error) {
        const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
        if (![404, 410].includes(statusCode)) {
          console.error('Could not send push notification', error);
          return;
        }
        await this.unsubscribe(userId, String(stored.endpoint)).catch(() => undefined);
      }
    }));
  },
};
