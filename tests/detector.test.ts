import { describe, expect, it } from 'vitest';
import { detect, normalize } from '../lib/detector';
import { defaults, parseSettings } from '../lib/settings';

describe('local spoiler matching', () => {
  it.each([
    'GTA 6 - Analiza i Ciekawostki 4',
    'GTA 6: SZCZEGÓŁOWA ANALIZA MAPY',
    'Grand Theft Auto VI: An Extended Look',
  ])('treats %s as gameplay or story coverage in Balanced', (title) => {
    expect(detect(title, defaults)).toBe(true);
    expect(detect(title, { ...defaults, mode: 'light' })).toBe(false);
    expect(detect(title, { ...defaults, spoilerFree: true })).toBe(false);
  });
  it.each([
    'Jason dies in GTA 6',
    'GTA VI: Lucia story',
    'Grand Theft Auto VI walkthrough',
    'GTAVI ending explained',
    'GＴＡ ６ — Lúcia',
    'GTA\u200b6 leaked story',
  ])('blocks %s', (title) => {
    expect(detect(title, defaults)).toBe(true);
  });
  it.each([
    'Jason reviews a movie',
    'Lucia cooking tutorial',
    'GTA 5 ending',
    'GTAVice city guide',
    'GTA 6 release date',
    'GTA 6 trailer reaction',
    'GTA 6 classical music',
  ])('allows %s', (title) => {
    expect(detect(title, defaults)).toBe(false);
  });
  it('uses word boundaries and normalizes punctuation', () => {
    expect(detect('GTA 6: Jasonville sightseeing', defaults)).toBe(false);
    expect(normalize('  GＴＡ—VI: Lúcia! ')).toBe('gta vi lucia');
  });
  it('keeps light narrow and strict broad', () => {
    expect(
      detect('GTA 6 Lucia interview', { ...defaults, mode: 'light' }),
    ).toBe(false);
    expect(detect('GTA 6 release date', { ...defaults, mode: 'strict' })).toBe(
      true,
    );
    expect(detect('GTA 6 ending', { ...defaults, mode: 'light' })).toBe(true);
  });
  it('experimental mode allows ambiguous content while retaining explicit and custom signals', () => {
    const settings = {
      ...defaults,
      mode: 'strict' as const,
      spoilerFree: true,
      keywords: ['bank robbery'],
    };
    expect(detect('GTA 6 Jason gameplay', settings)).toBe(false);
    expect(detect('GTA 6 ending', settings)).toBe(true);
    expect(detect('GTA 6 spoiler-free review', settings)).toBe(false);
    expect(detect('GTA 6 no spoilers gameplay', settings)).toBe(false);
    expect(
      detect('GTA 6 spoiler-free review: ending explained', settings),
    ).toBe(true);
    expect(detect('GTA 6 bank robbery', settings)).toBe(true);
    expect(detect('Bank robbery in a movie', settings)).toBe(false);
  });
  it('treats custom phrases literally and honors the global switch', () => {
    expect(detect('GTA 6 .*', { ...defaults, keywords: ['.*'] })).toBe(false);
    expect(detect('GTA 6 ending', { ...defaults, enabled: false })).toBe(false);
  });
  it('repairs invalid stored preferences and bounds custom input', () => {
    expect(parseSettings({ allowReveal: false }).allowReveal).toBe(false);
    expect(parseSettings({ allowReveal: 'false' }).allowReveal).toBe(true);
    expect(parseSettings(null)).toEqual(defaults);
    expect(
      parseSettings({
        enabled: 'false',
        mode: 'other',
        keywords: [' hi ', null, 'hi'],
      }),
    ).toEqual({ ...defaults, keywords: ['hi'] });
    expect(
      parseSettings({ keywords: Array.from({ length: 300 }, (_, i) => `${i}`) })
        .keywords,
    ).toHaveLength(200);
  });
});
