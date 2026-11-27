import { MATERIALS, MAT, type Behavior, type MaterialKey } from '../data/materials';
import { REACTIONS, type ContactReaction, type DecayReaction } from '../data/reactions';
import { OUT_OF_BOUNDS } from './grid';

/** Flat lookup tables built from src/data, for the hot simulation loop. */

export const MAX_MATERIALS = 64;

export const BEH = { empty: 0, static: 1, powder: 2, liquid: 3, gas: 4, fire: 5 } as const;
const BEH_OF: Record<Behavior, number> = BEH;

export const behaviorOf = new Uint8Array(256).fill(BEH.static); // unknown + out-of-bounds act as walls
export const densityOf = new Float32Array(256).fill(1000);
export const dispersionOf = new Uint8Array(256);
export const lifeMinOf = new Uint16Array(256);
export const lifeMaxOf = new Uint16Array(256);
/** 1 if explosions shatter the material. */
export const brittleOf = new Uint8Array(256);

for (const m of MATERIALS) {
  behaviorOf[m.id] = BEH_OF[m.behavior];
  densityOf[m.id] = m.density;
  dispersionOf[m.id] = m.dispersion ?? 0;
  brittleOf[m.id] = m.brittle ? 1 : 0;
  if (m.life) {
    lifeMinOf[m.id] = m.life[0];
    lifeMaxOf[m.id] = m.life[1];
  }
}
behaviorOf[OUT_OF_BOUNDS] = BEH.static;

export function matId(key: MaterialKey): number {
  return MAT[key];
}

/** contactIndex[a * MAX_MATERIALS + b] = index into CONTACTS, or -1. */
export const CONTACTS: readonly ContactReaction[] = REACTIONS.filter((r): r is ContactReaction => r.kind === 'contact');
export const contactIndex = new Int16Array(MAX_MATERIALS * MAX_MATERIALS).fill(-1);
/** Per contact: bitmask of allowed neighbor directions (bit n = NX/NY index n: up, right, down, left). */
export const contactDirMask = new Uint8Array(CONTACTS.length);
const DIR_BIT = { up: 1, right: 2, down: 4, left: 8 } as const;
/** 1 if the material is `a` in any contact reaction. */
export const hasContact = new Uint8Array(256);
CONTACTS.forEach((r, i) => {
  const a = MAT[r.a];
  const b = MAT[r.b];
  if (contactIndex[a * MAX_MATERIALS + b] !== -1) throw new Error(`Duplicate contact reaction ${r.a}+${r.b}`);
  contactIndex[a * MAX_MATERIALS + b] = i;
  hasContact[a] = 1;
  contactDirMask[i] = r.directions ? r.directions.reduce((acc, d) => acc | DIR_BIT[d], 0) : 15;
});

/** decayOf[material] = index into DECAYS, or -1. */
export const DECAYS: readonly DecayReaction[] = REACTIONS.filter((r): r is DecayReaction => r.kind === 'decay');
export const decayOf = new Int16Array(256).fill(-1);
DECAYS.forEach((r, i) => {
  decayOf[MAT[r.from]] = i;
});

/** Global reaction index (into REACTIONS) for each contact / decay, for counting discoveries. */
export const contactGlobal = CONTACTS.map((r) => REACTIONS.indexOf(r));
export const decayGlobal = DECAYS.map((r) => REACTIONS.indexOf(r));

for (const m of MATERIALS) {
  if (m.life && decayOf[m.id] === -1) throw new Error(`Material ${m.key} has a lifetime but no decay reaction`);
}
