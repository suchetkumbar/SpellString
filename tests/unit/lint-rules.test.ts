import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('lint rules', { timeout: 30_000 }, () => {
  it('bans Math.random in src/core and src/game', async () => {
    const code = 'export const r = Math.random();\n';
    expect(await ruleIds(code, 'src/core/probe.ts')).toContain('no-restricted-properties');
    expect(await ruleIds(code, 'src/game/probe.ts')).toContain('no-restricted-properties');
  });

  it('allows Math.random outside the simulation (e.g. cosmetic render code)', async () => {
    expect(await ruleIds('export const r = Math.random();\n', 'src/render/probe.ts')).toEqual([]);
  });

  it('bans DOM globals in src/core', async () => {
    expect(await ruleIds('export const w = document.title;\n', 'src/core/probe.ts')).toContain('no-restricted-globals');
  });
});
