// The exported Morphe keyword list against Vice Guard's own matcher, scored
// with Morphe's matching rules: `npm run eval:morphe`.
// Morphe sees titles, channel lines and comments, never thumbnails, so rows
// whose GTA 6 signal is only in the image (OCR/visual) are left out.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildMorpheList } from '../../scripts/morphe-keywords';
import { classify } from '../../lib/detector';
import { defaults } from '../../lib/settings';
import { matchText, parseKeywords } from './morphe-match';

interface Row {
  id?: string;
  text: string;
  label: 0 | 1;
  site: string;
  category?: string;
  carrier?: string;
}
const generated = (
  JSON.parse(readFileSync('tests/eval/dataset.json', 'utf8')) as Row[]
).filter((row) => row.carrier === 'text');
const holdout = readFileSync('tests/eval/holdout.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((line) => ({ ...(JSON.parse(line) as Row), category: 'holdout' }));

const { keywords } = buildMorpheList();
const parsed = parseKeywords(keywords.join('\n'));

interface Score {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}
const score = (rows: Row[], hit: (row: Row) => boolean) => {
  const s: Score = { tp: 0, fn: 0, fp: 0, tn: 0 };
  for (const row of rows)
    if (row.label) s[hit(row) ? 'tp' : 'fn']++;
    else s[hit(row) ? 'fp' : 'tn']++;
  return s;
};
const pct = (a: number, b: number) =>
  b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a';
const viceGuard = (row: Row) => classify(row.text, defaults).hit;
const morphe = (row: Row) => matchText(parsed, row.text) !== undefined;

const lines = [
  '# Morphe keyword list vs Vice Guard',
  '',
  `${keywords.length} exported keywords, matched with Morphe's rules`,
  "(tests/eval/morphe-match.ts). Text rows only: Morphe can't read thumbnails.",
  '',
  '| Rows | Positives | Vice Guard recall | Morphe recall | Negatives | Vice Guard FP | Morphe FP |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];
const sets: [string, Row[]][] = [
  ['YouTube, generated', generated.filter((r) => r.site === 'youtube')],
  ['YouTube, holdout', holdout.filter((r) => r.site === 'youtube')],
  [
    'YouTube, all',
    [...generated, ...holdout].filter((r) => r.site === 'youtube'),
  ],
  ['All sites', [...generated, ...holdout]],
];
for (const [name, rows] of sets) {
  const vg = score(rows, viceGuard);
  const mo = score(rows, morphe);
  lines.push(
    `| ${name} | ${vg.tp + vg.fn} | ${pct(vg.tp, vg.tp + vg.fn)} | ${pct(mo.tp, mo.tp + mo.fn)} | ${vg.fp + vg.tn} | ${pct(vg.fp, vg.fp + vg.tn)} (${vg.fp}) | ${pct(mo.fp, mo.fp + mo.tn)} (${mo.fp}) |`,
  );
}

const all = [...generated, ...holdout];
const youtube = all.filter((r) => r.site === 'youtube');
const show = (row: Row) =>
  `- [${row.site}/${row.category}] ${JSON.stringify(row.text)}`;
const missed = youtube.filter((r) => r.label && !morphe(r));
lines.push(
  '',
  `## YouTube positives the list misses (${missed.length})`,
  '',
  ...missed.map(
    (r) => `${show(r)}${viceGuard(r) ? ' (Vice Guard catches it)' : ''}`,
  ),
);
const wrong = all.filter((r) => !r.label && morphe(r));
lines.push(
  '',
  `## Negatives the list hides, all sites (${wrong.length})`,
  '',
  ...wrong.map(
    (r) => `${show(r)} <- ${JSON.stringify(matchText(parsed, r.text))}`,
  ),
);
const report = lines.join('\n');
writeFileSync('tests/eval/morphe-report.md', `${report}\n`);
console.log(report);
