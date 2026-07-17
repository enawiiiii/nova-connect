import { describe, expect, it } from 'vitest';
import { createId, notificationPermission } from '../lib/platform';

describe('mobile platform compatibility', () => {
  it('creates API-compatible UUIDs without assuming a secure context', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('handles browsers without the Notifications API', () => {
    expect(['default', 'denied', 'granted']).toContain(notificationPermission());
  });
});
