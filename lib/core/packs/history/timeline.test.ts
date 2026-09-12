import { describe, expect, it } from 'vitest';
import { subjectTimelineLabel } from './gather';

/**
 * The rule this guards: a label must never assert temporal semantics that
 * contradict the geometry it labels. "Hundred Years' War begins" on a bar
 * spanning 1337–1453 says "a moment" while the bar says "a hundred and
 * sixteen years".
 */
describe('subjectTimelineLabel', () => {
  it('uses a temporal verb only for a genuine point in a life', () => {
    expect(subjectTimelineLabel('Napoleon', 'person')).toBe('Born — Napoleon');
  });

  for (const type of ['conflict', 'period', 'event'] as const) {
    it(`names a ${type} rather than claiming it began at a point`, () => {
      const label = subjectTimelineLabel("Hundred Years' War", type);
      expect(label).toBe("Hundred Years' War");
      expect(label).not.toMatch(/begins|began|starts/i);
    });
  }
});
