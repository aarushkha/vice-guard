// Writes Vice Guard's rules for Morphe-patched YouTube: `npm run export:morphe`.
//   dist/morphe/keywords.txt  one keyword per line, for "Hide keyword content"
//   dist/morphe/dropped.txt   what was left out, and why
//   dist/morphe/settings.json the keywords and the four switches, for
//                             Settings > Morphe > Import / Export > Import file
// Morphe's import resets every setting that is not in the file. To keep your
// other Morphe settings, export them in the app first and pass that file:
//   npm run export:morphe -- --merge Morphe_Settings_2026-11-20.txt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildMorpheList } from './morphe-keywords';

const out = 'dist/morphe';
const { keywords, dropped } = buildMorpheList();

/** Parses Morphe's export: a JSON object, possibly without braces. */
function readExport(path: string): Record<string, unknown> {
  let text = readFileSync(path, 'utf8').trim();
  if (text.endsWith(',')) text = text.slice(0, -1);
  if (!text.startsWith('{')) text = `{\n${text}\n}`;
  return JSON.parse(text) as Record<string, unknown>;
}
const mergeAt = process.argv.indexOf('--merge');
const base = mergeAt > 0 ? readExport(process.argv[mergeAt + 1]!) : {};

// Setting keys without Morphe's optional "morphe_" prefix, as the export writes them.
const settings = {
  ...base,
  hide_keyword_content_home: true,
  hide_keyword_content_search: true,
  hide_keyword_content_subscriptions: true,
  hide_keyword_content_comments: true,
  hide_keyword_content_phrases: keywords.join('\n'),
};

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/keywords.txt`, `${keywords.join('\n')}\n`);
writeFileSync(
  `${out}/dropped.txt`,
  `${dropped.map(({ entry, reason }) => `${entry}\t${reason}`).join('\n')}\n`,
);
writeFileSync(`${out}/settings.json`, `${JSON.stringify(settings, null, 1)}\n`);
console.log(
  `${keywords.length} keywords, ${dropped.length} dropped entries -> ${out}/` +
    (mergeAt > 0 ? ` (merged with ${Object.keys(base).length} settings)` : ''),
);
