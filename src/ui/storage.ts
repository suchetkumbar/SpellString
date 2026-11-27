import { MemoryStore, type KeyValueStore } from '../core/storage';

/** localStorage as a KeyValueStore, falling back to memory if it's unavailable (private mode, blocked). */
export function browserStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    const probe = '__spellstring_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      get: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          // Full or blocked: the write is lost, the game goes on.
        }
      },
      remove: (k) => {
        try {
          ls.removeItem(k);
        } catch {
          // ignore
        }
      },
    };
  } catch {
    console.warn('Spellstring: localStorage unavailable; the Codex will not persist.');
    return new MemoryStore();
  }
}
