import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  playHangupTone,
  startIncomingRingtone,
  startOutgoingRingback,
  stopAllCallLoops,
  stopOutgoingRingback,
} from '../lib/call-sounds';

describe('call sounds', () => {
  const oscillators: Array<{
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    oscillators.length = 0;
    class MockAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator() {
        const oscillator = {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext });
  });

  afterEach(() => {
    stopAllCallLoops();
    vi.useRealTimers();
  });

  it('repeats ringing, switches to ringback, and stops loops before the hangup tone', async () => {
    startIncomingRingtone();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(2_200);
    expect(oscillators).toHaveLength(8);

    startOutgoingRingback();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators).toHaveLength(10);
    expect(oscillators.slice(0, 8).some((oscillator) => oscillator.stop.mock.calls.length > 0)).toBe(true);

    stopOutgoingRingback();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(oscillators).toHaveLength(10);

    playHangupTone();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators).toHaveLength(12);
  });
});
