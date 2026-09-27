/**
 * The game's sound, synthesised rather than sampled.
 *
 * Every sound here is a few oscillators and an envelope — no audio files, so
 * nothing to load, nothing to license, and the tones can be tuned to sit with
 * a board that reads as ink on paper rather than sounding like a slot
 * machine. Kept short and soft: this is feedback, not a soundtrack. There is
 * deliberately no background music.
 *
 * Every entry point is guarded. Audio is unavailable server-side, can be
 * blocked by the browser, and can throw on a context that was never unlocked
 * by a gesture; a missing sound must never interrupt a tap.
 */

import { mulberry32 } from "./rng";

/** Soft: the loudest thing here still sits under the phone's own UI sounds. */
const MASTER_GAIN = 0.28;

/**
 * A run of clears steps up a pentatonic scale, so tapping quickly plays a
 * rising phrase instead of the same note over and over. Pentatonic because
 * every step of it agrees with every other — a wrong-sounding note is not a
 * thing this game should be able to make.
 */
const STREAK_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
/** The pause that ends a run, in ms. Long enough to survive a moment's
 * searching, short enough that the next burst starts low again. */
const STREAK_RESET_MS = 2600;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let streak = 0;
let lastClearAt = 0;

/** Whether sound plays at all. Persisted per player; see lib/storage.ts. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) streak = 0;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * The audio context, created on first use and resumed if the browser
 * suspended it. Every caller is inside a tap handler, which is the gesture
 * browsers require before audio may start.
 */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    return master ? { ctx: context, out: master } : null;
  } catch {
    return null; // blocked or unsupported — play on in silence
  }
}

interface ToneOptions {
  freq: number;
  /** Where the pitch ends up, for a sound that slides. */
  endFreq?: number;
  type?: OscillatorType;
  /** Seconds from the call, for stacking notes into a phrase. */
  delay?: number;
  attack?: number;
  decay?: number;
  gain?: number;
}

function tone({ freq, endFreq, type = "sine", delay = 0, attack = 0.005, decay = 0.18, gain = 0.5 }: ToneOptions): void {
  const a = audio();
  if (!a) return;
  try {
    const startAt = a.ctx.currentTime + delay;
    const osc = a.ctx.createOscillator();
    const env = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + decay);

    // An exponential fall, never quite to zero: ramping to 0 is undefined for
    // exponential ramps and clicks on some browsers.
    env.gain.setValueAtTime(0.0001, startAt);
    env.gain.exponentialRampToValueAtTime(gain, startAt + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + decay);

    osc.connect(env);
    env.connect(a.out);
    osc.start(startAt);
    osc.stop(startAt + attack + decay + 0.02);
  } catch {
    // a context that refused to start — nothing to do
  }
}

/** Semitones above A3 (220Hz), which is where all of this is pitched. */
function note(semitones: number): number {
  return 220 * Math.pow(2, semitones / 12);
}

/**
 * A short burst of filtered noise, which is what makes a pluck sound like
 * something struck rather than like a beep. Tones alone read as electronic
 * whatever their envelope.
 */
function knock(gain: number, brightness: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  try {
    const startAt = a.ctx.currentTime + delay;
    const length = Math.floor(a.ctx.sampleRate * 0.05);
    const buffer = a.ctx.createBuffer(1, length, a.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Noise that dies away over the buffer, so the burst has a shape of
      // its own even before the envelope is applied.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = a.ctx.createBufferSource();
    src.buffer = buffer;

    // Band-passed: unfiltered noise is a hiss, and the band is what gives
    // the knock a sense of the material it came off.
    const filter = a.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = brightness;
    filter.Q.value = 1.4;

    const env = a.ctx.createGain();
    env.gain.setValueAtTime(gain, startAt);
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.05);

    src.connect(filter);
    filter.connect(env);
    env.connect(a.out);
    src.start(startAt);
    src.stop(startAt + 0.06);
  } catch {
    // nothing to do
  }
}

/**
 * A piece cleared: a wooden pluck, a step higher than the last one if they
 * are coming quickly.
 *
 * Longer pieces sound heavier. A board where every line sounds identical
 * gives the ear nothing, and length is the one thing about a piece the
 * player can already see, so hearing it agrees with what they are looking
 * at.
 */
export function soundClear(pieceLength = 4): void {
  const now = Date.now();
  streak = now - lastClearAt > STREAK_RESET_MS ? 0 : Math.min(streak + 1, STREAK_STEPS.length - 1);
  lastClearAt = now;

  // Up to an octave down for the longest lines, quantised to the scale so a
  // heavy piece still lands in tune.
  const weight = Math.min(12, Math.round(Math.min(1, (pieceLength - 2) / 16) * 12));
  const base = note(24 + STREAK_STEPS[streak] - weight);
  knock(0.22, base * 1.6);
  tone({ freq: base, type: "triangle", decay: 0.16, gain: 0.44 });
  // A quiet octave above gives the pluck its edge without making it louder.
  tone({ freq: base * 2, type: "sine", decay: 0.1, gain: 0.13, delay: 0.006 });
}

/**
 * A queued piece going by itself: the same pluck, softer and without the
 * knock, so it reads as the board moving rather than as a tap. It also
 * leaves the run alone — the player did not play this one.
 */
export function soundQueuedGo(pieceLength = 4): void {
  const weight = Math.min(12, Math.round(Math.min(1, (pieceLength - 2) / 16) * 12));
  const base = note(21 - weight);
  tone({ freq: base, type: "sine", decay: 0.24, gain: 0.3 });
  tone({ freq: base * 1.5, type: "sine", decay: 0.18, gain: 0.12, delay: 0.03 });
}

/** A tap that cannot move: a low knock, not a buzzer. Ends the run. */
export function soundBlocked(): void {
  streak = 0;
  knock(0.3, 260);
  tone({ freq: note(-4), endFreq: note(-11), type: "triangle", decay: 0.14, gain: 0.4 });
  // A short rise on the end: the tap cost a life, but the piece is marked
  // and will go when it can, and the sound should not be purely a refusal.
  tone({ freq: note(12), endFreq: note(16), type: "sine", decay: 0.12, gain: 0.12, delay: 0.1 });
}

/** The hint lit a piece up. */
export function soundHint(): void {
  tone({ freq: note(28), type: "sine", decay: 0.22, gain: 0.3 });
  tone({ freq: note(35), type: "sine", decay: 0.3, gain: 0.2, delay: 0.06 });
}

/** A clear taken back — the pluck in reverse, sliding down. */
export function soundUndo(): void {
  streak = 0;
  tone({ freq: note(19), endFreq: note(12), type: "sine", decay: 0.2, gain: 0.32 });
}

/** The level is finished: a short rising arpeggio, timed to the paper burst. */
export function soundComplete(seed = 1): void {
  streak = 0;
  // The last note is picked from the chord, so consecutive levels don't end
  // on exactly the same phrase.
  const top = [36, 40, 43][Math.floor(mulberry32(seed)() * 3)];
  const phrase = [24, 28, 31, top];
  phrase.forEach((semitone, i) => {
    const at = i * 0.095;
    knock(0.1, note(semitone) * 2, at);
    tone({ freq: note(semitone), type: "triangle", delay: at, decay: 0.34, gain: 0.34 });
    tone({ freq: note(semitone) * 2, type: "sine", delay: at + 0.004, decay: 0.22, gain: 0.1 });
  });
  // The root underneath, quiet and longer, so the phrase settles instead of
  // stopping.
  tone({ freq: note(12), type: "sine", delay: 0.02, decay: 0.9, gain: 0.14 });
}
