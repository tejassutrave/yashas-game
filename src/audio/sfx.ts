let audioCtx: AudioContext | null = null;
let audioMuted = false;
let hornActive = false;
let hornOsc1: OscillatorNode | null = null;
let hornOsc2: OscillatorNode | null = null;
let hornGain: GainNode | null = null;

function ensureAudio(): AudioContext | null {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setMuted(muted: boolean): void {
  audioMuted = muted;
  if (muted) stopContinuousHorn();
}

export function isMuted(): boolean {
  return audioMuted;
}

export function playSFX(type: 'click' | 'select' | 'jump' | 'door'): void {
  if (audioMuted) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.055);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.11);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.12);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'door') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.14);
    }
  } catch {
    // Ignore audio context errors on restricted autoplay
  }
}

export function playTaxiStart(): void {
  if (audioMuted) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Crisp 2-tone taxi dispatch chime
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.085, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.17);
    });
  } catch {
    // Ignore
  }
}

export function playTaxiComplete(): void {
  if (audioMuted) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Cheerful 3-note cash chime
    [659.25, 880, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.09, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.23);
    });
  } catch {
    // Ignore
  }
}

export function playCycleBell(): void {
  if (audioMuted) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two crisp metallic "tring-tring!" bell strikes
    [0, 0.12].forEach((offset) => {
      [2150, 3240].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.08, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.15);
      });
    });
  } catch {
    // Ignore
  }
}

export function startContinuousHorn(vehicleStyle: string = 'sedan'): void {
  if (audioMuted) return;
  if (vehicleStyle === 'cycle') {
    playCycleBell();
    return;
  }
  if (hornActive) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    hornActive = true;
    const isTruck = vehicleStyle === 'truck';
    const isBike = vehicleStyle === 'bike';

    hornGain = ctx.createGain();
    hornGain.gain.setValueAtTime(0.001, ctx.currentTime);
    hornGain.gain.linearRampToValueAtTime(isTruck ? 0.1 : 0.075, ctx.currentTime + 0.04);
    hornGain.connect(ctx.destination);

    hornOsc1 = ctx.createOscillator();
    hornOsc2 = ctx.createOscillator();
    hornOsc1.type = isBike ? 'triangle' : 'sawtooth';
    hornOsc2.type = isBike ? 'sine' : 'sawtooth';
    hornOsc1.frequency.setValueAtTime(isTruck ? 185 : isBike ? 640 : 392, ctx.currentTime);
    hornOsc2.frequency.setValueAtTime(isTruck ? 233 : isBike ? 820 : 493.88, ctx.currentTime);
    hornOsc1.connect(hornGain);
    hornOsc2.connect(hornGain);
    hornOsc1.start();
    hornOsc2.start();
  } catch {
    // Ignore
  }
}

export function stopContinuousHorn(): void {
  if (!hornActive) return;
  hornActive = false;
  try {
    if (hornGain && audioCtx) {
      hornGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.04);
    }
    const o1 = hornOsc1;
    const o2 = hornOsc2;
    setTimeout(() => {
      try {
        o1?.stop();
        o2?.stop();
      } catch {
        // Ignore
      }
    }, 55);
  } catch {
    // Ignore
  }
  hornOsc1 = null;
  hornOsc2 = null;
  hornGain = null;
}

