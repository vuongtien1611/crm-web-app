/**
 * Utility for synthesizing crisp, modern notification chimes using Web Audio API.
 * Requires 0 external audio files, works 100% offline, with zero 404/network latency.
 */

let audioCtx: AudioContext | null = null;

const SOUND_STORAGE_KEY = 'crm_notification_sound';

/**
 * Check if notification sound is enabled in user settings
 */
export function isNotificationSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Toggle notification sound setting and persist in localStorage
 */
export function toggleNotificationSound(): boolean {
  const current = isNotificationSoundEnabled();
  const next = !current;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, next ? 'true' : 'false');
  } catch {
    // ignore
  }
  return next;
}

/**
 * Set explicit notification sound state
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Unlock AudioContext on initial user interaction (click/touch/key)
 */
function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AudioCtxClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Pre-emptively unlock AudioContext on first user interaction with the page
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    getOrCreateAudioContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
}

/**
 * Synthesizes and plays a modern dual-tone notification chime:
 * Tone 1: E5 (659.25 Hz) bell pulse
 * Tone 2: A5 (880.00 Hz) resonant chime
 */
export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Note 1: E5 (659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Note 2: A5 (880.00Hz) - sweet chime overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.1);
    gain2.gain.setValueAtTime(0.0001, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.66);
  } catch (err) {
    console.warn('[NotificationSound] Audio playback failed:', err);
  }
}
