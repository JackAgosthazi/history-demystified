import { describe, expect, it } from 'vitest';
import type { WdEntity } from '../../connectors/wikidata';
import { expandPolity, parseRomanNumeral, parseScope } from './scope';

describe('parseRomanNumeral', () => {
  it('reads well-formed numerals', () => {
    expect(parseRomanNumeral('XV')).toBe(15);
    expect(parseRomanNumeral('xix')).toBe(19);
    expect(parseRomanNumeral('IV')).toBe(4);
    expect(parseRomanNumeral('XXI')).toBe(21);
  });

  /**
   * The round-trip check is what makes this safe to run over free text: an
   * arbitrary run of letters must not read as a number merely because those
   * letters happen to be Roman digits.
   */
  it('rejects malformed numerals rather than guessing', () => {
    expect(parseRomanNumeral('IIII')).toBeNull();
    expect(parseRomanNumeral('IL')).toBeNull();
    expect(parseRomanNumeral('VV')).toBeNull();
    expect(parseRomanNumeral('')).toBeNull();
    expect(parseRomanNumeral('England')).toBeNull();
  });
});

describe('parseScope', () => {
  it('reads a Roman century and answers in arabic', () => {
    const scope = parseScope('England in the XV century');
    expect(scope).toMatchObject({ place: 'England', from: 1401, to: 1500 });
    expect(scope?.rendered).toBe('the 15th century');
  });

  it('treats Roman and arabic centuries identically', () => {
    expect(parseScope('France XVI century')).toMatchObject(
      parseScope('France 16th century') as object,
    );
  });

  it.each([
    ['Japan 1600', 1590, 1610],
    ['England 1400-1500', 1400, 1500],
    ['France 1790s', 1790, 1799],
  ])('reads %s', (query, from, to) => {
    expect(parseScope(query)).toMatchObject({ from, to });
  });

  /** A place is always required: "1984" is a novel, not a scope. */
  it('declines a bare year with no place', () => {
    expect(parseScope('1984')).toBeNull();
    expect(parseScope('1600')).toBeNull();
  });

  it('does not mistake a regnal number for a century', () => {
    expect(parseScope('Louis XIV')).toBeNull();
    expect(parseScope('Charles V')).toBeNull();
  });
});

/**
 * Searching by country alone silently loses everything from before the modern
 * state: England is Q21, while the Wars of the Roses is recorded under
 * Kingdom of England. Wikidata already records that England *replaces* the
 * Kingdom of England, so the relation is read rather than hardcoded.
 */
describe('expandPolity', () => {
  const entity = (claims: WdEntity['claims']): WdEntity => ({ id: 'Q21', claims });
  const qidClaim = (id: string) => ({
    mainsnak: { snaktype: 'value' as const, datavalue: { type: 'wikibase-entityid', value: { id } } },
    rank: 'normal' as const,
  });

  it('includes the predecessor state', () => {
    const expanded = expandPolity(entity({ P1365: [qidClaim('Q179876')] }));
    expect(expanded).toContain('Q21');
    expect(expanded).toContain('Q179876');
  });

  it('includes the successor state', () => {
    expect(expandPolity(entity({ P1366: [qidClaim('Q161885')] }))).toContain('Q161885');
  });

  it('returns just the place when nothing is linked', () => {
    expect(expandPolity(entity({}))).toEqual(['Q21']);
  });

  it('caps the set so the query stays small', () => {
    const many = Array.from({ length: 12 }, (_, i) => qidClaim(`Q${1000 + i}`));
    expect(expandPolity(entity({ P1365: many })).length).toBeLessThanOrEqual(6);
  });
});
