import type { GameEvent } from '../game/context';
import { MAT } from '../data/materials';

/**
 * Procedural sound: every effect is synthesized with WebAudio from
 * oscillators and filtered noise (no audio files). The context is created on
 * the first user gesture (browsers require it). Volumes come from settings.
 */

export interface Volumes {
  readonly master: number;
  readonly sfx: number;
  readonly ambient: number;
}

/** Per-biome ambience: a filtered noise bed, plus optional bubbles or chimes. */
const BIOME_AMBIENCE: Record<string, { readonly lowpass: number; readonly gain: number; readonly bubbles: boolean; readonly chimes: boolean }> = {
  hollows: { lowpass: 320, gain: 0.5, bubbles: false, chimes: false },
  tarpits: { lowpass: 220, gain: 0.55, bubbles: true, chimes: false },
  vaults: { lowpass: 1400, gain: 0.25, bubbles: false, chimes: true },
  none: { lowpass: 260, gain: 0.3, bubbles: false, chimes: false },
};

/** Minimum ms between two sounds of the same kind (keeps bursts readable). */
const COOLDOWN_MS: Partial<Record<GameEvent['kind'], number>> = {
  hit: 40,
  impact: 30,
  splash: 60,
  sizzle: 90,
  fizzle: 80,
  discover: 200,
  hurt: 80,
  cast: 25,
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private bedGain: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private suctionGain: GainNode | null = null;
  private suctionFilter: BiquadFilterNode | null = null;
  private readonly last = new Map<string, number>();
  private biome = 'none';
  private volumes: Volumes = { master: 0.7, sfx: 0.8, ambient: 0.5 };

  /** Start audio (call from a user gesture). Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.amb = ctx.createGain();
      this.amb.connect(this.master);
      // Two seconds of white noise, reused by every noisy sound.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      this.noiseBuf = buf;
      this.startBed();
      this.startSuction();
      this.setVolumes(this.volumes);
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(v.master, t, 0.05);
    this.sfx?.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.amb?.gain.setTargetAtTime(v.ambient, t, 0.2);
  }

  /** Per-frame ambience: the biome bed, fire crackle and acid bubbling near the witch, harvest suction. */
  ambience(biome: string | null, fire: number, acid: number, harvesting: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const key = biome ?? 'none';
    const a = BIOME_AMBIENCE[key] ?? BIOME_AMBIENCE.none!;
    const t = ctx.currentTime;
    if (key !== this.biome) {
      this.biome = key;
      this.bedFilter?.frequency.setTargetAtTime(a.lowpass, t, 0.5);
      this.bedGain?.gain.setTargetAtTime(a.gain * 0.12, t, 0.8);
    }
    this.suctionGain?.gain.setTargetAtTime(harvesting ? 0.08 : 0, t, 0.05);
    if (harvesting) this.suctionFilter?.frequency.setTargetAtTime(900 + Math.random() * 900, t, 0.08);
    // Crackle: little noise ticks, more of them the more fire is about.
    if (fire > 0 && Math.random() < Math.min(0.6, fire / 60)) this.noise(this.amb, 0.02 + Math.random() * 0.03, 'bandpass', 1500 + Math.random() * 2500, 0.06 * Math.min(1, fire / 40), undefined, 3);
    if (acid > 0 && Math.random() < Math.min(0.15, acid / 200)) this.tone(this.amb, 'sine', 300 + Math.random() * 400, 900, 0.05, 0.03);
    if (a.bubbles && Math.random() < 0.02) this.tone(this.amb, 'sine', 90 + Math.random() * 60, 200, 0.12, 0.05);
    if (a.chimes && Math.random() < 0.004) this.tone(this.amb, 'sine', 1800 + Math.random() * 1200, undefined, 0.6, 0.015);
  }

  /** Play the sound for a game event. */
  play(e: GameEvent): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const now = performance.now();
    const cd = COOLDOWN_MS[e.kind];
    if (cd !== undefined) {
      if (now - (this.last.get(e.kind) ?? -1e9) < cd) return;
      this.last.set(e.kind, now);
    }
    const out = this.sfx;
    switch (e.kind) {
      case 'cast':
        if (e.delivery === '>') {
          this.tone(out, 'square', 880, 330, 0.09, 0.12);
          this.noise(out, 0.04, 'highpass', 4000, 0.04);
        } else if (e.delivery === ')') {
          this.tone(out, 'triangle', 320, 170, 0.16, 0.2);
        } else if (e.delivery === '@') {
          this.tone(out, 'sine', 190, 80, 0.25, 0.22);
          this.noise(out, 0.2, 'lowpass', 700, 0.1);
        } else {
          this.tone(out, 'square', 1400, undefined, 0.03, 0.08);
          this.tone(out, 'square', 1100, undefined, 0.03, 0.08, 0.05);
        }
        break;
      case 'impact':
        if (e.kinetic) this.tone(out, 'sine', 140, 55, 0.1, 0.25);
        else this.noise(out, 0.12, 'lowpass', 900, 0.2);
        if (e.materials.includes(MAT.fire)) this.noise(out, 0.25, 'bandpass', 600, 0.12, 2400);
        break;
      case 'splash':
        this.noise(out, 0.3, 'bandpass', 1400, 0.22, 350);
        break;
      case 'explode':
        this.noise(out, 0.9, 'lowpass', 500, 0.5 + Math.min(0.3, e.r * 0.04), 70);
        this.tone(out, 'sine', 75, 32, 0.6, 0.45);
        break;
      case 'hurt':
        this.tone(out, 'square', 170, 105, 0.12, 0.2);
        break;
      case 'hit':
        this.tone(out, 'square', 430, 300, 0.05, 0.08);
        break;
      case 'kill':
        this.tone(out, 'triangle', 620, 150, 0.18, 0.15);
        this.noise(out, 0.12, 'bandpass', 900, 0.08);
        break;
      case 'death':
        this.tone(out, 'sine', 440, 55, 1.2, 0.3);
        this.noise(out, 1.0, 'lowpass', 300, 0.15, 80);
        break;
      case 'fizzle':
        this.noise(out, 0.15, 'highpass', 2200, 0.1);
        this.tone(out, 'sine', 520, 190, 0.12, 0.06);
        break;
      case 'sizzle':
        this.noise(out, 0.25, 'highpass', 3500, Math.min(0.18, 0.04 + e.amount * 0.02));
        break;
      case 'discover':
        this.tone(out, 'sine', 880, undefined, 0.12, 0.1);
        this.tone(out, 'sine', 1320, undefined, 0.2, 0.1, 0.1);
        break;
      case 'chest':
        [660, 880, 1100].forEach((f, i) => this.tone(out, 'triangle', f, undefined, 0.12, 0.1, i * 0.07));
        break;
      case 'portal':
        this.tone(out, 'sine', 300, 1200, 0.6, 0.15);
        break;
    }
  }

  private tone(dest: AudioNode | null, type: OscillatorType, f0: number, f1: number | undefined, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dest: AudioNode | null, dur: number, type: BiquadFilterType, freq: number, gain: number, freqEnd?: number, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !dest || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** The ambient bed: looping noise through a slowly wobbling lowpass. */
  private startBed(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = BIOME_AMBIENCE.none!.lowpass;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb!);
    src.start();
    lfo.start();
    this.bedGain = g;
    this.bedFilter = f;
  }

  /** Harvest suction: a looping band of noise, faded in while harvesting. */
  private startSuction(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx!);
    src.start();
    this.suctionGain = g;
    this.suctionFilter = f;
  }
}
