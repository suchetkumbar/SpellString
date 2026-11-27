/** What happened over a whole run, for the death screen's postcard. Shared by every level of the run. */
export class RunStats {
  /** Times each spell was cast (one click = one cast). */
  readonly casts = new Map<string, number>();
  /** Creatures killed by each spell. */
  readonly kills = new Map<string, number>();
  /** Reaction ids seen this run. */
  readonly reactions = new Set<string>();
  creaturesKilled = 0;
  chestsOpened = 0;

  countCast(spell: string): void {
    this.casts.set(spell, (this.casts.get(spell) ?? 0) + 1);
  }

  countKill(spell: string | null): void {
    this.creaturesKilled++;
    if (spell) this.kills.set(spell, (this.kills.get(spell) ?? 0) + 1);
  }

  /** The spell with the most kills; with no kills, the one cast most. Null if nothing was cast. */
  bestSpell(): string | null {
    const top = (m: Map<string, number>): string | null => {
      let best: string | null = null;
      let n = 0;
      for (const [k, v] of m) {
        if (v > n || (v === n && best !== null && k.length > best.length)) {
          best = k;
          n = v;
        }
      }
      return best;
    };
    return top(this.kills) ?? top(this.casts);
  }
}
