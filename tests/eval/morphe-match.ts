// Morphe's "Hide keyword content" matching, ported from KeywordContentFilter
// and BufferPhraseFilter (morphe-patches v2.3.0) so the eval scores an
// exported list the way the patched app applies it.

const MINIMUM_KEYWORD_LENGTH = 3;
const HANDLE_PREFIX = '@';

export interface MorpheKeyword {
  /** As entered, without the whole-word quotes. */
  phrase: string;
  wholeWord: boolean;
}

// Character.isWhitespace: space separators except no-break spaces, and controls.
const javaWhitespace =
  /^[\t\n\u000B\f\r\u001C-\u001F \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]$/;
const isWhitespace = (c: string) => javaWhitespace.test(c);
// BufferPhraseFilter.isLanguageWithNoSpaces: these Unicode blocks.
const noSpaces =
  /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF\u0F00-\u0FFF]/;
// Character.isLetter: Lu, Ll, Lt, Lm and Lo.
const isLetter = (codePoint: number) =>
  /\p{L}/u.test(String.fromCodePoint(codePoint));

/** String.toLowerCase(Locale.ROOT). */
export const foldCase = (text: string) => text.toLowerCase();

function stripTrailing(text: string) {
  let end = text.length;
  while (end > 0 && isWhitespace(text[end - 1]!)) end--;
  return text.slice(0, end);
}

/** KeywordContentFilter.parseKeywords(), in setting order. */
export function parseKeywords(raw: string): MorpheKeyword[] {
  const keywords = new Map<string, MorpheKeyword>();
  for (let phrase of raw.split('\n')) {
    phrase = stripTrailing(phrase);
    if ([...phrase].every(isWhitespace)) continue;
    let wholeWord: boolean;
    if (phrase.startsWith('"') && phrase.endsWith('"')) {
      if (phrase.length === 2) continue;
      phrase = phrase.slice(1, -1);
      wholeWord = true;
    } else if (
      phrase.length < MINIMUM_KEYWORD_LENGTH &&
      !noSpaces.test(phrase)
    ) {
      continue; // The app shows a toast and ignores it.
    } else wholeWord = false;
    // Declared with and without quotes: the broader, unquoted one wins.
    const key = foldCase(phrase);
    const existing = keywords.get(key);
    if (!existing || (existing.wholeWord && !wholeWord))
      keywords.set(key, { phrase, wholeWord });
  }
  return [...keywords.values()];
}

function codePointBefore(text: string, index: number) {
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.codePointAt(index - 2)!;
  }
  return low;
}

/** The match is not touching other letters; digits and symbols are fine. */
function isWholeWord(text: string, start: number, length: number) {
  if (start > 0 && isLetter(codePointBefore(text, start))) return false;
  const end = start + length;
  return end >= text.length || !isLetter(text.codePointAt(end)!);
}

/**
 * The keyword that hides a text, if any. Morphe searches each shown text on
 * its own (title, each metadata part, comment, author); a channel handle
 * ("/@name") is searched with `handle` set, where only @keywords count.
 */
export function matchText(
  keywords: MorpheKeyword[],
  text: string,
  handle = false,
): string | undefined {
  if (!text) return undefined;
  const folded = foldCase(text);
  for (const { phrase, wholeWord } of keywords) {
    if (handle && !phrase.startsWith(HANDLE_PREFIX)) continue;
    const key = foldCase(phrase);
    for (let i = folded.indexOf(key); i >= 0; i = folded.indexOf(key, i + 1))
      if (!wholeWord || isWholeWord(folded, i, key.length)) return phrase;
  }
  return undefined;
}
