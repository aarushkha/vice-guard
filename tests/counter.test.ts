import { describe, expect, it } from 'vitest';
import { counterOnly } from '../lib/engine/engine';

const text = (oldValue: string, value: string) =>
  ({
    type: 'characterData',
    oldValue,
    target: { textContent: value },
  }) as unknown as MutationRecord;

describe('counter-only mutations', () => {
  it.each([
    ['0:12', '0:13'],
    ['1,234 likes', '1,235 likes'],
    ['12K views', '13K views'],
    ['2 h', '3 h'],
    ['3 days ago', '4 days ago'],
    ['4.5M', '4.6M'],
    ['5', '6'],
  ])('ignores %s -> %s', (from, to) =>
    expect(counterOnly(text(from, to))).toBe(true),
  );
  it.each([
    ['0:12', 'GTA 6'],
    ['Loading', 'Vice City 2026'],
    ['12 views', 'Episode 6'],
    ['', '6'],
    ['1 like', 'Jason dies'],
  ])('keeps %s -> %s', (from, to) =>
    expect(counterOnly(text(from, to))).toBe(false),
  );
});

import { namesOtherGame } from '../lib/match/matcher';

describe('namesOtherGame (stops the image classifier alone hiding these)', () => {
  it.each([
    'GTA 5 funny moments',
    'San Andreas | GTA SA',
    'GTA IV ending',
    'Red Dead 2 story',
  ])('true for %s', (text) => expect(namesOtherGame(text)).toBe(true));
  it.each([
    'This changes everything',
    'GTA 6 vs GTA 5',
    'Leonida map vs San Andreas',
    'watch till the end',
  ])('false for %s', (text) => expect(namesOtherGame(text)).toBe(false));
  it.each(['GilANS | GTAS', 'GTA1V | GTA1V'])(
    'true for OCR misreading %s',
    (text) => expect(namesOtherGame(text, true)).toBe(true),
  );
});
