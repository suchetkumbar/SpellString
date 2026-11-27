/**
 * Tutorial hints: one short line while the witch stands in a column range of
 * levels/tutorial.txt, until its lesson is done. The level itself does the
 * teaching; these only name the controls. Backticked glyphs are highlighted.
 */
export type TutorialDone = 'hasWater' | 'ventOut' | 'hasSand' | 'chestOpened';

export interface TutorialHint {
  readonly x0: number;
  readonly x1: number;
  readonly text: string;
  /** Hide once this is true. */
  readonly until?: TutorialDone;
}

export const TUTORIAL_HINTS: readonly TutorialHint[] = [
  { x0: 0, x1: 13, text: 'A / D to walk · W to jump' },
  { x0: 13, x1: 29, text: 'hold right click on `~` to drink it in', until: 'hasWater' },
  { x0: 26, x1: 39, text: '`^` fears `~`. Tab, write `>~`, Enter, then click at the fire\'s root', until: 'ventOut' },
  { x0: 40, x1: 56, text: 'hold right click on `.` to gather it', until: 'hasSand' },
  { x0: 54, x1: 70, text: 'too wide to jump. `.` fills holes: try `>.3`' },
  { x0: 76, x1: 88, text: '`&` is a glyph chest: walk into it', until: 'chestOpened' },
  { x0: 88, x1: 100, text: 'a slime. Hit it and it splits' },
  { x0: 100, x1: 110, text: '`O` leads down' },
];
