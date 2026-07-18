import { isLocalDevelopment } from '../config/env.js';
import { localDb } from '../database/local.database.js';
import { db } from '../database/supabase.js';
import { AppError } from '../utils/errors.js';

interface ModerationState {
  suspendedUntil: string | null;
}

function stateFromEvents(events: Array<{ details: Record<string, unknown> | null; created_at: string }>): ModerationState {
  const latest = events
    .filter((event) => ['suspend_24h', 'suspend_7d', 'restore_account'].includes(String(event.details?.action ?? '')))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest || latest.details?.action === 'restore_account') return { suspendedUntil: null };
  const suspendedUntil = typeof latest.details?.suspendedUntil === 'string' ? latest.details.suspendedUntil : null;
  return { suspendedUntil: suspendedUntil && suspendedUntil > new Date().toISOString() ? suspendedUntil : null };
}

export const accountModerationService = {
  async state(userId: string): Promise<ModerationState> {
    if (isLocalDevelopment) {
      const events = await localDb.read((state) => state.appEvents.filter((event) => (
        event.source === 'report-moderation' && event.details?.targetUserId === userId
      )));
      return stateFromEvents(events);
    }
    const { data, error } = await db
      .from('app_events')
      .select('details,created_at')
      .eq('source', 'report-moderation')
      .eq('details->>targetUserId', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return { suspendedUntil: null };
    return stateFromEvents((data ?? []) as Array<{ details: Record<string, unknown> | null; created_at: string }>);
  },

  async assertCanAuthenticate(userId: string) {
    const state = await this.state(userId);
    if (state.suspendedUntil) {
      throw new AppError(403, `Account access is suspended until ${state.suspendedUntil}`, 'ACCOUNT_SUSPENDED');
    }
  },

  async revokeSessions(userId: string) {
    const now = new Date().toISOString();
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        state.refreshTokens.filter((token) => token.user_id === userId && !token.revoked_at).forEach((token) => { token.revoked_at = now; });
      });
      return;
    }
    const { error } = await db.from('refresh_tokens').update({ revoked_at: now }).eq('user_id', userId).is('revoked_at', null);
    if (error) throw new AppError(500, 'Could not revoke user sessions', 'SESSION_REVOKE_FAILED');
  },
};
