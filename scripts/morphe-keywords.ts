// Vice Guard's rules as a keyword list for Morphe's "Hide keyword content".
// Morphe lowercases and finds each keyword anywhere in a title, channel line or
// comment; a "quoted" keyword must not touch other letters, and an @keyword
// also matches channel handles. It has no context rules, so only phrases that
// mean GTA 6 on their own are kept, and every phrase must be one Vice Guard
// itself blocks.
import { seedBlocklist } from '../lib/channels';
import { classify, tables } from '../lib/match/matcher';
import * as lex from '../lib/match/lexicon';
import { defaults } from '../lib/settings';

export interface Dropped {
  entry: string;
  reason: string;
}
export interface MorpheList {
  /** One keyword per line, as Morphe reads them. */
  keywords: string[];
  dropped: Dropped[];
}

const isLetter = (c: string) => /\p{L}/u.test(c);
const lastChar = (text: string) => [...text].at(-1) ?? '';
/** Quote anything that ends in a letter: "gta vi" must not match "GTA Vice City". */
const quoteIfWord = (phrase: string) =>
  isLetter(lastChar(phrase)) ? `"${phrase}"` : phrase;
const quote = (phrase: string) => `"${phrase}"`;

// Explicit names: the matcher's "gta"/"grand theft auto"/"theft auto" + a
// sequel number, and the glued forms of lex.glued ("gta6", "grandtheftautovi").
const prefixes = ['gta', 'grand theft auto', 'theft auto', 'grandtheftauto'];
const spelled = ['g.t.a', 'g.t.a.', 'g t a', 'g-t-a', 'g_t_a'];
const separators = [
  '',
  ' ',
  '  ',
  '-',
  '_',
  '.',
  ' - ',
  '–',
  ' – ',
  '—',
  ' — ',
];
const sixes = [...lex.sixes];

// Look-alike spellings Vice Guard folds away (normalize.ts) but Morphe
// compares literally. Only the core "GTA 6" forms get them.
const fullwidth = (text: string) =>
  text.replace(/[a-z0-9]/g, (c) =>
    String.fromCodePoint(c.codePointAt(0)! + 0xfee0),
  );
// Mathematical alphanumerics ("𝐆𝐓𝐀 𝟔", "𝗚𝗧𝗔 𝟲"): capital A, small a, digit 0.
const mathStyles: [number, number, number?][] = [
  [0x1d400, 0x1d41a, 0x1d7ce], // bold
  [0x1d434, 0x1d44e], // italic
  [0x1d468, 0x1d482], // bold italic
  [0x1d49c, 0x1d4b6], // script
  [0x1d4d0, 0x1d4ea], // bold script
  [0x1d504, 0x1d51e], // fraktur
  [0x1d538, 0x1d552, 0x1d7d8], // double-struck
  [0x1d56c, 0x1d586], // bold fraktur
  [0x1d5a0, 0x1d5ba, 0x1d7e2], // sans
  [0x1d5d4, 0x1d5ee, 0x1d7ec], // sans bold
  [0x1d608, 0x1d622], // sans italic
  [0x1d63c, 0x1d656], // sans bold italic
  [0x1d670, 0x1d68a, 0x1d7f6], // monospace
];
// Letters of those styles that Unicode keeps in Letterlike Symbols.
const mathHoles: Record<number, number> = {
  [0x1d49c + 8]: 0x2110, // script I
  [0x1d4b6 + 6]: 0x210a, // script g
  [0x1d504 + 8]: 0x2111, // fraktur I
};
function mathText(
  text: string,
  [upper, lower, digit]: [number, number, number?],
) {
  return [...text]
    .map((c) => {
      let point: number | undefined;
      if (/[A-Z]/.test(c)) point = upper + c.charCodeAt(0) - 65;
      else if (/[a-z]/.test(c)) point = lower + c.charCodeAt(0) - 97;
      else if (/[0-9]/.test(c) && digit) point = digit + c.charCodeAt(0) - 48;
      return point === undefined
        ? c
        : String.fromCodePoint(mathHoles[point] ?? point);
    })
    .join('');
}
const invisible = ['\u200B', '\u200C', '\u200D', '\u2060', '\u00AD', '\uFEFF'];

function explicit(): string[] {
  const out: string[] = [];
  for (const prefix of prefixes)
    for (const separator of separators)
      for (const six of sixes) out.push(prefix + separator + six);
  for (const prefix of spelled)
    for (const separator of ['', ' ', '-', '.'])
      for (const six of sixes) out.push(prefix + separator + six);
  return out.map(quoteIfWord);
}

function lookalikes(): string[] {
  const out: string[] = [];
  const pair = (gta: string[], six: string[], seps = ['', ' ']) => {
    for (const g of gta)
      for (const separator of seps)
        for (const s of six) out.push(g + separator + s);
  };
  // Roman numeral Ⅵ (lowercased by Morphe to ⅵ), circled and raised sixes.
  pair([...prefixes, ...spelled], ['ⅵ'], ['', ' ', '-', '.']);
  pair(['gta'], ['⑥', '⁶', '₆', '６']);
  pair(
    [fullwidth('gta'), fullwidth('theft auto')],
    [fullwidth('6'), '6', fullwidth('vi'), 'ⅵ'],
    ['', ' ', '\u3000'],
  );
  pair(['ɢᴛᴀ'], ['6', 'vi', 'ᴠɪ']);
  pair(['🇬🇹🇦'], ['6', 'vi']);
  // Cyrillic т and а inside "gta".
  pair(['gта', 'gтa', 'gtа'], ['6', 'vi']);
  // Leetspeak, but not "gt4 6" (Gran Turismo 4, Porsche GT4).
  pair(['gt4'], ['vi']);
  for (const style of mathStyles) {
    const six = style[2] ? [mathText('6', style), '6'] : ['6'];
    pair([mathText('GTA', style)], [...six, mathText('VI', style)]);
    pair([mathText('gta', style)], [...six, mathText('vi', style)]);
  }
  // Zero-width characters inside or after "gta".
  for (const mark of invisible) {
    pair([`g${mark}ta`, `gt${mark}a`, `g${mark}t${mark}a`], ['6', 'vi']);
    pair([`gta${mark}`], ['6', 'vi'], ['']);
  }
  return out.map(quoteIfWord);
}

const words = (list: lex.PhraseList) => [...list.text];
const names = ['jason', 'lucia'];

/** Unique place and character names, as written and glued ("#LeonidaKeys"). */
function uniqueNames(): string[] {
  const glued = [...tables.gluedPhrases]
    .filter(([, phrase]) =>
      tables.lists.unique.includes(` ${phrase.join(' ')} `),
    )
    .map(([key]) => key);
  return [...words(lex.uniqueNames).map(quote), ...glued];
}

/** Jason and Lucia named together, and either named with "GTA". */
function leads(): string[] {
  const out: string[] = [];
  const joiners = [
    ' and ',
    ' & ',
    '&',
    ' x ',
    ' ',
    '/',
    ' + ',
    ', ',
    ' n ',
    ' y ',
    ' e ',
    ' et ',
    ' und ',
    ' i ',
  ];
  for (const [a, b] of [names, [...names].reverse()])
    for (const joiner of joiners) out.push(quote(a + joiner + b));
  for (const name of names)
    for (const game of ['gta', 'grand theft auto']) {
      for (const joiner of [' ', ' from ', ' in ', ' of ', "'s "])
        out.push(quote(name + joiner + game));
      out.push(quote(`${game} ${name}`));
    }
  return out;
}

// "GTA" next to a news or story word: Vice Guard's gta-recent rule, which needs
// the words anywhere in the title, written as adjacent phrases.
const gtaWordReasons: Record<string, string> = {
  review:
    '"Alfa Romeo Giulia GTA review": GTA is a car trim; Vice Guard drops it on car words, a keyword cannot',
  sales: '"GTA home sales": Greater Toronto Area real estate',
  price: '"GTA prices": Greater Toronto Area real estate',
  killer: '"GTA killer arrested": Greater Toronto Area crime news',
  '100': 'a bare number after GTA ("GTA 100 cars")',
  'next gen': 'GTA V Enhanced was sold as "GTA next gen" (2022)',
  ps5: 'GTA V Enhanced was sold as "GTA PS5" (2022)',
  'ps5 pro': 'GTA V Enhanced on PS5 Pro',
  'xbox series': 'GTA V Enhanced on Xbox Series X|S',
  'series x': 'GTA V Enhanced on Xbox Series X|S',
};
for (const date of lex.dateSignals)
  gtaWordReasons[date] =
    '"GTA 2026 housing market": Greater Toronto Area; Vice Guard drops it on Toronto words, a keyword cannot';
for (const word of [
  'protagonist',
  'protagonists',
  'character',
  'characters',
  'side character',
  'villain',
])
  gtaWordReasons[word] =
    '"Trevor is the best GTA protagonist": rankings across every GTA; Vice Guard shows them when another game\'s character is named, a keyword cannot';

function gtaCombos(dropped: Dropped[]): string[] {
  const out: string[] = [];
  const all = [
    ...new Set([
      ...words(lex.recentSignals),
      ...words(lex.storyWords),
      ...words(lex.strong),
    ]),
  ];
  for (const word of all) {
    const reason = gtaWordReasons[word];
    for (const game of ['gta', 'grand theft auto']) {
      const phrase = `${game} ${word}`;
      if (reason) {
        dropped.push({ entry: phrase, reason });
        continue;
      }
      // Short last words would run into longer ones ("gta arc" in "GTA Arcade").
      const last = word.split(' ').at(-1)!;
      if (last.length <= 3) out.push(quote(phrase), quote(`${phrase}s`));
      else out.push(phrase);
    }
  }
  return out;
}

function rockstarCombos(): string[] {
  const out: string[] = [];
  const signals = [
    'trailer',
    'trailer 2',
    'trailer 3',
    'leak',
    'delay',
    'release date',
    'countdown',
    'preorder',
    'spoiler',
    'ending',
    'plot twist',
    'final mission',
    'who dies',
    'betrayal',
    'secret ending',
  ];
  for (const studio of [
    'rockstar',
    "rockstar's",
    'rockstar’s',
    'rockstar games',
    "rockstar games'",
  ])
    for (const word of signals) out.push(`${studio} ${word}`);
  return out;
}

function viceCity(): string[] {
  return [...lex.dateSignals, 'trailer 2', 'trailer 3'].map(
    (signal) => `vice city ${signal}`,
  );
}

/** YouTube handles from the seeded blocklist. */
function channels(dropped: Dropped[]): string[] {
  const out: string[] = [];
  for (const entry of Object.values(seedBlocklist(0))) {
    const handle = /^youtube:(@[\w.-]+)$/.exec(entry.key)?.[1];
    if (handle) out.push(quote(handle.toLowerCase()));
    else if (entry.key.startsWith('youtube:name:'))
      dropped.push({
        entry: entry.name,
        reason:
          'channel name only: Morphe would also match it in titles ("Rockstar Games" in Red Dead videos); the @handle covers the channel',
      });
    else
      dropped.push({
        entry: entry.name,
        reason: 'not a YouTube channel',
      });
  }
  return out;
}

function standaloneDrops(): Dropped[] {
  const dropped: Dropped[] = [];
  const add = (entries: readonly string[], reason: string) =>
    entries.forEach((entry) => dropped.push({ entry, reason }));
  add(
    words(lex.weakNames),
    'a weak name: Vice Guard needs a game word in the same title ("Jason Momoa", "Santa Lucia", "Duval Street", "Ambrosia salad")',
  );
  add(
    ['gta', 'grand theft auto', 'rockstar', 'rockstar games'],
    'any GTA or Rockstar game, the Greater Toronto Area, a car trim or a song; Vice Guard needs a GTA 6 signal',
  );
  add(
    ['vice city'],
    'GTA Vice City (2002) and Miami travel videos; Vice Guard needs a new-game signal',
  );
  add(['vi', '6'], 'shorter than 3 characters and means nothing alone');
  add(
    ['new gta', 'next gta', 'upcoming gta', 'latest gta'],
    '"NEW GTA Online update": Vice Guard excludes titles naming another GTA game, a keyword cannot',
  );
  add(
    [
      'vice city trailer',
      'vice city leak',
      'vice city release date',
      'vice city ps5',
    ],
    '"GTA Vice City (2002) trailer" and the Definitive Edition share these words',
  );
  add(['gt4 6'], 'Gran Turismo 4 and the Porsche GT4 ("GT4 6-speed")');
  add(
    words(lex.strong),
    'a spoiler word without GTA 6 context would hide every "ending explained" video; GTA 6 + word is covered by the GTA 6 entries and the "gta <word>" combinations',
  );
  add(
    [...new Set([...words(lex.recentSignals), ...words(lex.storyWords)])],
    'a news or story word alone; only counts next to "GTA" or "Rockstar" (see the combinations)',
  );
  add(
    words(lex.otherTitles),
    'Vice Guard un-hides titles that name another game ("GTA 6 vs GTA 5" stays hidden, "GTA 5 ending" shows); Morphe has no exceptions, so these are not exported',
  );
  dropped.push({
    entry: 'misspellings and leetspeak (Leonda, L3onida, Rockstr)',
    reason:
      'Vice Guard matches names one edit away and undoes leetspeak; Morphe compares text literally',
  });
  return dropped;
}

interface Parsed {
  line: string;
  key: string;
  wholeWord: boolean;
}
const parse = (line: string): Parsed => {
  const wholeWord =
    line.length > 2 && line.startsWith('"') && line.endsWith('"');
  const phrase = wholeWord ? line.slice(1, -1) : line;
  return { line, key: phrase.toLowerCase(), wholeWord };
};

/** `a` matches every text that `b` matches, so `b` is redundant. */
function subsumes(a: Parsed, b: Parsed): boolean {
  if (a.key === b.key) return a.wholeWord <= b.wholeWord;
  if (b.key.startsWith('@') && !a.key.startsWith('@')) return false;
  for (let i = b.key.indexOf(a.key); i >= 0; i = b.key.indexOf(a.key, i + 1)) {
    if (!a.wholeWord) return true;
    const end = i + a.key.length;
    const leftOk = i > 0 ? !isLetter(b.key[i - 1]!) : b.wholeWord;
    const rightOk = end < b.key.length ? !isLetter(b.key[end]!) : b.wholeWord;
    if (leftOk && rightOk) return true;
  }
  return false;
}

export function buildMorpheList(): MorpheList {
  const dropped = standaloneDrops();
  const candidates = [
    ...explicit(),
    ...uniqueNames(),
    ...leads(),
    ...viceCity(),
    ...gtaCombos(dropped),
    ...rockstarCombos(),
    ...lookalikes(),
  ];
  const handles = channels(dropped);

  const kept: Parsed[] = [];
  for (const line of candidates) {
    const parsed = parse(line);
    if ([...parsed.key].length < 3 && !parsed.wholeWord) continue;
    const phrase = parsed.wholeWord ? line.slice(1, -1) : line;
    if (!classify(phrase, defaults).hit) {
      dropped.push({
        entry: phrase,
        reason: 'Vice Guard does not block this phrase by itself',
      });
      continue;
    }
    kept.push(parsed);
  }
  for (const line of handles) kept.push(parse(line));

  // Drop exact duplicates and lines another line already covers.
  const unique = kept.filter(
    (entry, i) => kept.findIndex((other) => other.key === entry.key) === i,
  );
  const keywords = unique
    .filter(
      (entry) =>
        !unique.some((other) => other !== entry && subsumes(other, entry)),
    )
    .map((entry) => entry.line);
  return { keywords, dropped };
}
