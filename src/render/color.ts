/** Scales a #rrggbb color's brightness by `factor`, clamped. */
export function scaleColor(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number): string => {
    const v = Math.round(((n >> shift) & 0xff) * factor);
    return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
