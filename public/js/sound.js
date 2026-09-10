/**
 * Petits sons synthétisés (Web Audio) et vibrations : aucun fichier à charger.
 * Désactivables depuis la barre du haut ; le choix est mémorisé sur l'appareil.
 */
const MUTE_KEY = 'qadc:muted';
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* stockage indisponible : son activé par défaut */ }

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch { /* tant pis, le choix vaut pour cette visite */ }
}

/** Les navigateurs mobiles n'autorisent le son qu'après un geste : on le débloque au premier toucher. */
export function unlockAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, start, duration, { type = 'sine', gain = 0.15 } = {}) {
  const osc = ctx.createOscillator();
  const volume = ctx.createGain();
  const t0 = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.value = freq;
  volume.gain.setValueAtTime(gain, t0);
  volume.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(volume).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

const SOUNDS = {
  tick: () => tone(880, 0, 0.07, { type: 'square', gain: 0.04 }), // 5 dernières secondes
  go: () => { tone(523, 0, 0.12); tone(784, 0.1, 0.2); }, // nouvelle étape
  ok: () => { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.3); }, // bien vu
  ko: () => { tone(311, 0, 0.2, { type: 'sawtooth', gain: 0.06 }); tone(233, 0.18, 0.35, { type: 'sawtooth', gain: 0.06 }); },
  ballot: () => tone(660, 0, 0.1, { type: 'triangle', gain: 0.12 }), // un bulletin dépouillé
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35)),
};

export function play(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  SOUNDS[name]?.();
}

/** Vibration (téléphones Android ; ignorée ailleurs). */
export function vibrate(pattern) {
  if (!muted && navigator.vibrate) navigator.vibrate(pattern);
}
