type CallToneLoop = 'incoming' | 'outgoing';
type ToneNote = {
  at: number;
  duration: number;
  frequency: number;
  volume: number;
  wave?: OscillatorType;
};

interface WebkitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let audioContext: AudioContext | null = null;
let activeLoop: { kind: CallToneLoop; timer: number } | null = null;
const loopNodes = new Set<OscillatorNode>();
let primed = false;
let lastHangupAt = 0;

const incomingPattern: ToneNote[] = [
  { at: 0, duration: 0.34, frequency: 740, volume: 0.12, wave: 'sine' },
  { at: 0, duration: 0.34, frequency: 880, volume: 0.08, wave: 'sine' },
  { at: 0.46, duration: 0.34, frequency: 740, volume: 0.12, wave: 'sine' },
  { at: 0.46, duration: 0.34, frequency: 880, volume: 0.08, wave: 'sine' },
];

const outgoingPattern: ToneNote[] = [
  { at: 0, duration: 0.42, frequency: 425, volume: 0.07, wave: 'sine' },
  { at: 0, duration: 0.42, frequency: 475, volume: 0.055, wave: 'sine' },
];

const hangupPattern: ToneNote[] = [
  { at: 0, duration: 0.12, frequency: 620, volume: 0.11, wave: 'sine' },
  { at: 0.13, duration: 0.2, frequency: 390, volume: 0.1, wave: 'sine' },
];

function getAudioContext() {
  if (audioContext && audioContext.state !== 'closed') return audioContext;
  const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

async function readyAudioContext() {
  const context = getAudioContext();
  if (!context) return null;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return null;
    }
  }
  return context.state === 'running' ? context : null;
}

async function playPattern(pattern: ToneNote[], trackAsLoop = false) {
  const context = await readyAudioContext();
  if (!context) return;
  const startAt = context.currentTime + 0.02;

  pattern.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + note.at;
    const noteEnd = noteStart + note.duration;
    oscillator.type = note.wave ?? 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.02);
    gain.gain.setValueAtTime(note.volume, Math.max(noteStart + 0.02, noteEnd - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    if (trackAsLoop) loopNodes.add(oscillator);
    oscillator.onended = () => {
      loopNodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
  });
}

function stopLoopNodes() {
  loopNodes.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // The tone may already have finished.
    }
  });
  loopNodes.clear();
}

function startLoop(kind: CallToneLoop) {
  if (activeLoop?.kind === kind) return;
  stopAllCallLoops();
  const pattern = kind === 'incoming' ? incomingPattern : outgoingPattern;
  const interval = kind === 'incoming' ? 2_200 : 2_500;
  void playPattern(pattern, true);
  activeLoop = {
    kind,
    timer: window.setInterval(() => { void playPattern(pattern, true); }, interval),
  };
}

function stopLoop(kind: CallToneLoop) {
  if (activeLoop?.kind !== kind) return;
  window.clearInterval(activeLoop.timer);
  activeLoop = null;
  stopLoopNodes();
}

export function primeCallAudio() {
  if (primed) return;
  primed = true;
  const unlock = () => { void readyAudioContext(); };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('touchstart', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

export function startIncomingRingtone() {
  startLoop('incoming');
}

export function stopIncomingRingtone() {
  stopLoop('incoming');
}

export function startOutgoingRingback() {
  startLoop('outgoing');
}

export function stopOutgoingRingback() {
  stopLoop('outgoing');
}

export function stopAllCallLoops() {
  if (activeLoop) window.clearInterval(activeLoop.timer);
  activeLoop = null;
  stopLoopNodes();
}

export function playHangupTone() {
  const now = Date.now();
  stopAllCallLoops();
  if (now - lastHangupAt < 700) return;
  lastHangupAt = now;
  void playPattern(hangupPattern);
}
