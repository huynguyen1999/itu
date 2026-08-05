import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const growthPageSource = readFileSync(resolve(__dirname, 'GrowthPage.tsx'), 'utf8');
const defaultsEditorSource = growthPageSource.slice(
  growthPageSource.indexOf('function GrowthTaskRewardDefaultsEditor()'),
  growthPageSource.indexOf('function GrowthLoading()'),
);

describe('default task reward editor copy', () => {
  it('describes skill awards as weights with percentage units', () => {
    expect(defaultsEditorSource).not.toContain('Default task skill XP');
    expect(defaultsEditorSource).toMatch(/Default task skill weights/i);
    expect(defaultsEditorSource).toMatch(/skill weights?.*%|%.*skill weights?/is);
  });
});
