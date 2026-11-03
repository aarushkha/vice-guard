// Trains the CLIP image classifier: `npm run train:clip`.
//
// Downloads the images listed in tests/eval/clip-training.json into
// .model-cache/clip-training (never committed), embeds them with the
// shipped encoder and the extension's preprocessing (letterbox bars cut,
// shorter side 256 px), fits a class-balanced logistic regression and
// writes lib/image/classifier.json. Prints a cross-validated table first:
// folds keep near-duplicates (same Rockstar artwork, same YouTube search)
// together, so the numbers are for images unlike any trained on.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { CLIP_DTYPE, CLIP_MODEL } from '../lib/image/clip-files';
import { letterbox } from '../lib/image/letterbox';
import {
  gtaProbability,
  normalizeVector,
  type Classifier,
} from '../lib/image/score';

interface Training {
  positive: { art: string[]; youtube: { query: string; id: string }[] };
  negative: { youtube: { query: string; id: string }[] };
}
interface Item {
  file: string;
  url: string;
  label: 0 | 1;
  kind: 'art' | 'youtube';
  /** Images in one group are near-duplicates and share a fold. */
  group: string;
}

const training = JSON.parse(
  readFileSync('tests/eval/clip-training.json', 'utf8'),
) as Training;
const cache = '.model-cache/clip-training';
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const artGroup = (url: string) =>
  url
    .split('/')
    .pop()!
    .replace(/\.[^.]*\.[a-z]+$/, '')
    .replace(/_?(Desktop|Mobile|desktop|mobile)/g, '')
    .replace(/_(en_us|fr_fr|ja_jp|ko_kr|zh_hans|zh_tw)/g, '')
    .replace(/[_-]?\d+$/, '');
const items: Item[] = [
  ...training.positive.art.map((url) => ({
    file: join(cache, 'art', url.split('/').pop()!),
    url,
    label: 1 as const,
    kind: 'art' as const,
    group: `art:${artGroup(url)}`,
  })),
  ...training.positive.youtube.map(({ query, id }) => ({
    file: join(cache, 'positive', `${id}.jpg`),
    url: thumb(id),
    label: 1 as const,
    kind: 'youtube' as const,
    group: `pos:${query}`,
  })),
  ...training.negative.youtube.map(({ query, id }) => ({
    file: join(cache, 'negative', `${id}.jpg`),
    url: thumb(id),
    label: 0 as const,
    kind: 'youtube' as const,
    group: `neg:${query}`,
  })),
];

// 1. Download what is missing, eight at a time.
const missing = items.filter((item) => !existsSync(item.file));
for (let i = 0; i < missing.length; i += 8)
  await Promise.all(
    missing.slice(i, i + 8).map(async (item) => {
      const response = await fetch(item.url, {
        headers: { 'user-agent': 'Mozilla/5.0' },
      });
      if (!response.ok) return;
      mkdirSync(join(item.file, '..'), { recursive: true });
      writeFileSync(item.file, Buffer.from(await response.arrayBuffer()));
    }),
  );
if (missing.length)
  console.log(`Downloaded ${missing.length} training images.`);

// 2. Embed, cached by file name.
env.allowRemoteModels = false;
env.localModelPath = 'public/models/';
const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
  dtype: CLIP_DTYPE,
});
const embeddingsFile = join(cache, `embeddings-${CLIP_DTYPE}.json`);
const embeddings: Record<string, number[]> = existsSync(embeddingsFile)
  ? JSON.parse(readFileSync(embeddingsFile, 'utf8'))
  : {};
/** Same input as the extension: bars cut, shorter side at most 256 px. */
async function embed(file: string): Promise<number[] | undefined> {
  try {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bars = letterbox(data, info.width, info.height);
    const height = info.height - bars.top - bars.bottom;
    const scale = Math.min(1, 256 / Math.min(info.width, height));
    const [w, h] = [Math.round(info.width * scale), Math.round(height * scale)];
    const pixels = await sharp(file)
      .extract({ left: 0, top: bars.top, width: info.width, height })
      .resize(w, h)
      .removeAlpha()
      .raw()
      .toBuffer();
    const inputs = await processor(
      new RawImage(new Uint8ClampedArray(pixels), w, h, 3),
    );
    const { image_embeds } = (await model(inputs)) as {
      image_embeds: { data: Float32Array };
    };
    return normalizeVector(image_embeds.data);
  } catch {
    return undefined;
  }
}
for (const item of items)
  if (existsSync(item.file) && !embeddings[item.file]) {
    const vector = await embed(item.file);
    if (vector) embeddings[item.file] = vector;
  }
writeFileSync(embeddingsFile, JSON.stringify(embeddings));
const usable = items.filter((item) => embeddings[item.file]);
console.log(
  `${usable.filter((i) => i.label).length} positive, ${usable.filter((i) => !i.label).length} negative images.`,
);

// 3. Class-balanced, L2-regularised logistic regression by gradient descent.
const SCALE = 10;
function train(set: Item[], l2 = 1, steps = 600, rate = 0.5): Classifier {
  const positives = set.filter((i) => i.label).length;
  const weight = (item: Item) =>
    item.label ? 0.5 / positives : 0.5 / (set.length - positives);
  const dims = embeddings[set[0]!.file]!.length;
  const w = new Float64Array(dims);
  let b = 0;
  for (let step = 0; step < steps; step++) {
    const grad = new Float64Array(dims);
    let gradB = 0;
    for (const item of set) {
      const x = embeddings[item.file]!;
      let z = b;
      for (let d = 0; d < dims; d++) z += SCALE * w[d]! * x[d]!;
      const g = (1 / (1 + Math.exp(-z)) - item.label) * weight(item);
      for (let d = 0; d < dims; d++) grad[d]! += SCALE * g * x[d]!;
      gradB += g;
    }
    for (let d = 0; d < dims; d++)
      w[d]! -= rate * (grad[d]! + (l2 * w[d]!) / set.length);
    b -= rate * gradB;
  }
  return {
    model: CLIP_MODEL,
    dtype: CLIP_DTYPE,
    scale: SCALE,
    weights: Array.from(w, (v) => Math.round(v * 1e5) / 1e5),
    bias: Math.round(b * 1e5) / 1e5,
  };
}

// 4. Two-fold cross-validation over groups.
const fold = (group: string) => {
  let hash = 0;
  for (const char of group) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 2;
};
const scored: { item: Item; score: number }[] = [];
for (const f of [0, 1]) {
  const classifier = train(usable.filter((i) => fold(i.group) !== f));
  for (const item of usable.filter((i) => fold(i.group) === f))
    scored.push({
      item,
      score: gtaProbability(embeddings[item.file]!, classifier),
    });
}
const rate = (list: typeof scored, t: number) =>
  `${((100 * list.filter((s) => s.score >= t).length) / Math.max(1, list.length)).toFixed(1)}%`;
const art = scored.filter((s) => s.item.label && s.item.kind === 'art');
const youtube = scored.filter((s) => s.item.label && s.item.kind === 'youtube');
const negatives = scored.filter((s) => !s.item.label);
console.log('\nCross-validated (held-out groups):\n');
console.log(
  '| Sensitivity | GTA VI art caught | GTA 6 YouTube thumbnails caught | Other thumbnails blocked |',
);
console.log('| ---: | ---: | ---: | ---: |');
for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
  console.log(
    `| ${t.toFixed(1)} | ${rate(art, t)} | ${rate(youtube, t)} | ${rate(negatives, t)} |`,
  );

// 5. Final classifier on everything.
writeFileSync(
  'lib/image/classifier.json',
  `${JSON.stringify(train(usable))}\n`,
);
console.log('\nWrote lib/image/classifier.json');
