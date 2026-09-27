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
const MASTER_GAIN = 0.32;

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
 * A piece cleared: a short wooden pluck, a step higher than the last one if
 * they are coming quickly.
 */
export function soundClear(): void {
  const now = Date.now();
  streak = now - lastClearAt > STREAK_RESET_MS ? 0 : Math.min(streak + 1, STREAK_STEPS.length - 1);
  lastClearAt = now;

  const base = note(24 + STREAK_STEPS[streak]); // from A5 up
  tone({ freq: base, type: "triangle", decay: 0.16, gain: 0.5 });
  // A quiet octave above gives the pluck its edge without making it louder.
  tone({ freq: base * 2, type: "sine", decay: 0.1, gain: 0.16, delay: 0.005 });
}

/** A tap that cannot move: a low knock, not a buzzer. Ends the run. */
export function soundBlocked(): void {
  streak = 0;
  tone({ freq: note(-4), endFreq: note(-11), type: "triangle", decay: 0.14, gain: 0.45 });
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
    tone({ freq: note(semitone), type: "triangle", delay: i * 0.085, decay: 0.32, gain: 0.42 });
    tone({ freq: note(semitone) * 2, type: "sine", delay: i * 0.085 + 0.004, decay: 0.2, gain: 0.12 });
  });
}
