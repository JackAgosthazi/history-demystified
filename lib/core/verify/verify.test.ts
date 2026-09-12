import { describe, expect, it } from 'vitest';
import type { SourceDoc } from '../types';
import { buildTextFragment } from './fragment';
import { checkRelevance, findQuote } from './match';
import { normalize, toSourceSpan } from './normalize';
import { verifyClaims, type RawClaim } from './index';

const source = (text: string, over: Partial<SourceDoc> = {}): SourceDoc => ({
  id: 'S1',
  url: 'https://en.wikipedia.org/wiki/Napoleon',
  title: 'Napoleon',
  lang: 'en',
  publisher: 'Wikipedia (English)',
  text,
  truncated: false,
  ...over,
});

const WATERLOO =
  'The Battle of Waterloo was fought on Sunday 18 June 1815, near Waterloo ' +
  '(then in the United Kingdom of the Netherlands, now in Belgium), being the ' +
  'last engagement with Napoleon I. The French Imperial Army under the command ' +
  'of Napoleon I was defeated by two armies of the Seventh Coalition.';

describe('normalize', () => {
  it('folds the character variants models silently substitute', () => {
    const raw = 'fought 1337–1453 “the war”…';
    expect(normalize(raw).text).toBe('fought 1337-1453 "the war"...');
  });

  it('strips Wikipedia footnote markers', () => {
    expect(normalize('defeated at Waterloo[1] in 1815[note 2].').text).toBe(
      'defeated at waterloo in 1815.',
    );
  });

  it('decodes HTML entities', () => {
    expect(normalize('Lloyd&nbsp;George &amp; Clemenceau').text).toBe('lloyd george & clemenceau');
  });

  it('collapses whitespace runs', () => {
    expect(normalize('a  \n\t b').text).toBe('a b');
  });

  it('treats decomposed and precomposed accents as equal', () => {
    expect(normalize('Joséphine').text).toBe(normalize('Joséphine').text);
  });

  it('maps normalized offsets back onto the original string', () => {
    const raw = 'The Battle of Waterloo';
    const n = normalize(raw);
    const idx = n.text.indexOf('battle');
    const span = toSourceSpan(n, idx, idx + 'battle'.length, raw.length);
    expect(raw.slice(span.start, span.end)).toBe('Battle');
  });
});

describe('findQuote', () => {
  it('matches an exact span', () => {
    const m = findQuote('fought on Sunday 18 June 1815, near Waterloo', WATERLOO);
    expect(m?.method).toBe('exact');
    expect(WATERLOO.slice(m!.start, m!.end)).toContain('18 June 1815');
  });

  it('matches through punctuation and dash substitutions', () => {
    const m = findQuote('The Battle of Waterloo was fought on Sunday 18 June 1815', WATERLOO);
    expect(m?.method).toBe('exact');
  });

  it('tolerates a dropped parenthetical via trigram containment', () => {
    const spliced =
      'was fought on Sunday 18 June 1815, near Waterloo, being the last engagement with Napoleon I.';
    const m = findQuote(spliced, WATERLOO);
    expect(m?.method).toBe('fuzzy');
    expect(m!.score).toBeGreaterThanOrEqual(0.8);
  });

  it('rejects a quote that was rewritten rather than copied', () => {
    expect(
      findQuote('Napoleon lost a major battle in Belgium during the summer of 1815', WATERLOO),
    ).toBeNull();
  });

  it('refuses quotes too short to be evidence', () => {
    expect(findQuote('in 1815', WATERLOO)).toBeNull();
  });

  it('returns null when the quote is absent entirely', () => {
    expect(findQuote('The Congress of Vienna redrew the map of Europe entirely', WATERLOO)).toBeNull();
  });
});

describe('checkRelevance', () => {
  const span = { start: 0, end: WATERLOO.length };

  it('accepts a claim whose names and dates appear near the quote', () => {
    const r = checkRelevance('Napoleon was defeated at Waterloo in 1815.', WATERLOO, span);
    expect(r.ok).toBe(true);
  });

  it('rejects a real quote attached to an unsupported claim', () => {
    const r = checkRelevance(
      'Bismarck unified Germany in 1871 after defeating Austria and France.',
      WATERLOO,
      span,
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('bismarck');
  });

  it('passes claims with nothing checkable in them', () => {
    expect(checkRelevance('the battle was decisive', WATERLOO, span).ok).toBe(true);
  });

  it('matches a name across an accent boundary', () => {
    const spanish =
      'Entre tres y seis millones de civiles y soldados murieron en lo que se conocio ' +
      'como las guerras napoleonicas.';
    const r = checkRelevance(
      'Between three and six million soldiers and civilians died in the Napoleonic Wars.',
      spanish,
      { start: 0, end: spanish.length },
      { crossLanguage: true },
    );
    expect(r.ok).toBe(true);
  });

  it('still rejects an unrelated claim on a non-English source', () => {
    const german = 'Wahrend des Konsulats von 1799 bis 1804 stand Napoleon an der Spitze.';
    const r = checkRelevance(
      'Bismarck unified Germany in 1871 after defeating Austria and France.',
      german,
      { start: 0, end: german.length },
      { crossLanguage: true },
    );
    expect(r.ok).toBe(false);
  });
});

describe('buildTextFragment', () => {
  it('escapes the hyphen, which is a delimiter in the fragment syntax', () => {
    const url = buildTextFragment('https://example.org/a', 'a well-known outcome of the war');
    expect(url).toContain('#:~:text=');
    expect(url).toContain('%2D');
  });

  it('uses a start,end pair for long spans', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    expect(buildTextFragment('https://example.org/a', long).split(',')).toHaveLength(2);
  });

  it('appends to an existing section fragment rather than replacing it', () => {
    const url = buildTextFragment('https://example.org/a#Early_life', 'some quoted sentence here');
    expect(url).toContain('#Early_life:~:text=');
  });
});

describe('verifyClaims', () => {
  const claim = (over: Partial<RawClaim>): RawClaim => ({
    id: 'c1',
    text: 'Napoleon was defeated at Waterloo in 1815.',
    sourceId: 'S1',
    quote: 'The French Imperial Army under the command of Napoleon I was defeated',
    ...over,
  });

  it('verifies a good claim and attaches a deep link', () => {
    const { claims, coverage } = verifyClaims([claim({})], [source(WATERLOO)]);
    expect(claims[0].verification.status).toBe('verified');
    expect(claims[0].verification.citationUrl).toContain(':~:text=');
    expect(coverage.coverage).toBe(1);
  });

  it('flags a claim citing a source that was never retrieved', () => {
    const { claims } = verifyClaims([claim({ sourceId: 'S9' })], [source(WATERLOO)]);
    expect(claims[0].verification.status).toBe('unverified');
    expect(claims[0].verification.reason).toContain('not one of the retrieved sources');
  });

  it('flags an invented quote', () => {
    const { claims } = verifyClaims(
      [claim({ quote: 'Napoleon conceded the field to Wellington at four in the afternoon' })],
      [source(WATERLOO)],
    );
    expect(claims[0].verification.status).toBe('unverified');
  });

  it('explains that a truncated source may be why a quote is missing', () => {
    const { claims } = verifyClaims(
      [claim({ quote: 'a sentence that is definitely not present in this excerpt at all' })],
      [source(WATERLOO, { truncated: true })],
    );
    expect(claims[0].verification.reason).toContain('truncated');
  });

  it('keeps unverified claims so coverage reflects reality', () => {
    const { claims, coverage } = verifyClaims(
      [claim({}), claim({ id: 'c2', sourceId: 'S9' })],
      [source(WATERLOO)],
    );
    expect(claims).toHaveLength(2);
    expect(coverage).toMatchObject({ total: 2, verified: 1, coverage: 0.5 });
  });

  it('rejects a genuine quote used to support an unrelated claim', () => {
    const { claims } = verifyClaims(
      [claim({ text: 'Bismarck unified Germany in 1871 after the Franco-Prussian War.' })],
      [source(WATERLOO)],
    );
    expect(claims[0].verification.status).toBe('unverified');
    expect(claims[0].verification.reason).toContain('does not mention');
  });
});
