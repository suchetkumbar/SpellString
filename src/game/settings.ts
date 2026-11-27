import type { KeyValueStore } from '../core/storage';
import { CONTROLS, type Action } from '../data/controls';

/** Where settings live in storage. */
export const SETTINGS_KEY = 'spellstring.settings.v1';

export interface SettingsData {
  /** 0..1 */
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly ambientVolume: number;
  /** Screen shake on big hits and explosions. */
  readonly shake: boolean;
  /** A few frames' freeze on heavy hits. */
  readonly hitStop: boolean;
  /** WebGL bloom + CRT pass (falls back to the plain canvas when unavailable). */
  readonly crt: boolean;
  /** Soft glow around fire, acid and explosions. */
  readonly glow: boolean;
  /** Brighter, flatter material colors on pure black. */
  readonly highContrast: boolean;
  /** No flicker, blinking or flashes; telegraphs stay steady. */
  readonly reduceFlashing: boolean;
  /** Open the how-to-play guide whenever the game starts. */
  readonly guideAtStart: boolean;
  /** Key overrides: action -> key codes. Actions not listed use the defaults. */
  readonly keys: Readonly<Partial<Record<Action, readonly string[]>>>;
}

export const DEFAULT_SETTINGS: SettingsData = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  ambientVolume: 0.5,
  shake: true,
  hitStop: true,
  crt: true,
  glow: true,
  highContrast: false,
  reduceFlashing: false,
  guideAtStart: true,
  keys: {},
};

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Parse saved settings defensively: unknown or malformed fields fall back to the defaults. */
export function parseSettings(text: string | null): SettingsData {
  if (!text) return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    const keys: Partial<Record<Action, string[]>> = {};
    if (raw.keys && typeof raw.keys === 'object') {
      for (const [action, codes] of Object.entries(raw.keys as Record<string, unknown>)) {
        if (action in CONTROLS && Array.isArray(codes) && codes.every((c) => typeof c === 'string') && codes.length > 0) {
          keys[action as Action] = codes as string[];
        }
      }
    }
    const d = DEFAULT_SETTINGS;
    return {
      masterVolume: clamp01(raw.masterVolume, d.masterVolume),
      sfxVolume: clamp01(raw.sfxVolume, d.sfxVolume),
      ambientVolume: clamp01(raw.ambientVolume, d.ambientVolume),
      shake: bool(raw.shake, d.shake),
      hitStop: bool(raw.hitStop, d.hitStop),
      crt: bool(raw.crt, d.crt),
      glow: bool(raw.glow, d.glow),
      highContrast: bool(raw.highContrast, d.highContrast),
      reduceFlashing: bool(raw.reduceFlashing, d.reduceFlashing),
      guideAtStart: bool(raw.guideAtStart, d.guideAtStart),
      keys,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Settings, saved on every change. */
export class Settings {
  private value: SettingsData;
  private readonly listeners: ((s: SettingsData) => void)[] = [];

  constructor(private readonly store: KeyValueStore) {
    this.value = parseSettings(store.get(SETTINGS_KEY));
  }

  get data(): SettingsData {
    return this.value;
  }

  update(patch: Partial<SettingsData>): void {
    this.value = { ...this.value, ...patch };
    this.store.set(SETTINGS_KEY, JSON.stringify(this.value));
    for (const l of this.listeners) l(this.value);
  }

  onChange(l: (s: SettingsData) => void): void {
    this.listeners.push(l);
  }

  /** The keys bound to an action (overrides, else defaults). */
  keysFor(action: Action): readonly string[] {
    return this.value.keys[action] ?? CONTROLS[action];
  }

  /** Bind one key to an action, replacing its keyboard keys (gamepad codes are kept). */
  rebind(action: Action, code: string): void {
    const pads = this.keysFor(action).filter((c) => c.startsWith('Pad'));
    this.update({ keys: { ...this.value.keys, [action]: [code, ...pads] } });
  }

  resetKeys(): void {
    this.update({ keys: {} });
  }
}
