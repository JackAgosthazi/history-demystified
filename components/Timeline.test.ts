import { describe, expect, it } from 'vitest';
import { buildTicks } from './Timeline';

/**
 * The axis has to pick a unit. A one-day battle, a 116-year war and a
 * three-century period cannot share one, and plotting by whole year collapsed
 * every event in a given year onto a single point — which is what made the
 * Waterloo campaign render as one mark.
 */
describe('buildTicks', () => {
  it('uses months when the whole subject fits inside a year', () => {
    const ticks = buildTicks(1815.2, 1815.55);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.every((t) => /[A-Z][a-z]{2}/.test(t.label))).toBe(true);
    expect(ticks[0].label).toMatch(/1815/);
  });

  it('distinguishes moments within the same year', () => {
    const march = buildTicks(1815, 1816);
    expect(new Set(march.map((t) => t.label)).size).toBe(march.length);
  });

  it('uses years across a century-scale span', () => {
    const ticks = buildTicks(1337, 1453);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.every((t) => /^\d{3,4}$/.test(t.label))).toBe(true);
  });

  it('labels BC spans as BC', () => {
    const ticks = buildTicks(-300, -30);
    expect(ticks.some((t) => t.label.endsWith('BC'))).toBe(true);
  });

  it('never emits a single tick for a real span', () => {
    for (const [min, max] of [[1815, 1815.6], [1337, 1453], [1400, 1700], [-500, -100]]) {
      expect(buildTicks(min, max).length).toBeGreaterThanOrEqual(2);
    }
  });
});
