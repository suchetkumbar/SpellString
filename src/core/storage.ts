/**
 * Persistence goes through this tiny interface so tests can use memory and the
 * browser can use localStorage (src/ui/storage.ts). Stores never throw: a full
 * or blocked storage just loses the write.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** An in-memory store (tests, and the fallback when localStorage is unavailable). */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}
