// Image-layer eval: `npm run eval:images`, then `npm run eval`.
// 1. Renders each dataset thumbnail (placeholder art + overlay text) with Playwright.
// 2. Runs the same Tesseract settings and MobileCLIP-S0 model the extension ships.
// Writes tests/eval/.cache/{ocr,clip,timing}.json. Optional real images go in
// tests/eval/images-real/{positive,negative}/ (gitignored) and get their own scores.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createWorker, OEM, PSM } from 'tesseract.js';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { CLIP_MODEL } from '../../lib/image/clip-model';
import sharp from 'sharp';
import { brightTextMask, confidentText, ocrParameters, recognizeOptions } from '../../lib/image/ocr';
import { gtaProbability, type PromptEmbeddings } from '../../lib/image/score';
import prompts from '../../lib/image/prompts.json';
import type { Example } from './build-dataset';

const cache = 'tests/eval/.cache';
const thumbs = join(cache, 'thumbs');
mkdirSync(thumbs, { recursive: true });
const dataset = JSON.parse(readFileSync('tests/eval/dataset.json', 'utf8')) as Example[];
const withThumbs = dataset.filter((example) => example.thumb);

const scenes: Record<string, string> = {
  neon: 'linear-gradient(160deg,#2b0057,#ff2fa0 55%,#ffb347)',
  sunset: 'linear-gradient(180deg,#ff7e5f,#feb47b 45%,#1d2b64)',
  night: 'radial-gradient(circle at 30% 20%,#2c3e75,#05070f 70%)',
  dark: 'radial-gradient(circle at 70% 60%,#7a0b0b,#000 65%)',
  bright: 'linear-gradient(120deg,#00d2ff,#fff200)',
};
const fonts = ['Impact', 'Arial Black', 'Verdana', 'Georgia', 'Trebuchet MS'];

function html(example: Example, index: number) {
  const thumb = example.thumb!;
  const rotate = ((index * 37) % 13) - 6;
  const top = 18 + ((index * 53) % 45);
  const color = index % 3 === 0 ? '#ffe600' : '#fff';
  const size = thumb.text.length > 12 ? 46 : 64;
  // Silhouettes stand in for scenery so text is not on a flat background.
  return `<body style="margin:0"><div style="position:relative;width:480px;height:360px;overflow:hidden;background:${scenes[thumb.scene]}">
    <div style="position:absolute;left:${(index * 29) % 300}px;bottom:0;width:140px;height:${120 + (index % 5) * 30}px;background:#0008;border-radius:60px 60px 0 0"></div>
    <div style="position:absolute;right:20px;bottom:0;width:90px;height:220px;background:repeating-linear-gradient(0deg,#0009 0 12px,#ffd70055 12px 16px)"></div>
    <div style="position:absolute;left:0;right:0;top:${top}%;text-align:center;transform:rotate(${rotate}deg);font:900 ${size}px '${fonts[index % fonts.length]}';color:${color};-webkit-text-stroke:3px #000;paint-order:stroke;text-shadow:4px 4px 0 #000">${thumb.text}</div>
  </div></body>`;
}

async function render() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 360 }, deviceScaleFactor: 2 });
  for (const [index, example] of withThumbs.entries()) {
    const file = join(thumbs, `${example.id}.png`);
    if (existsSync(file)) continue;
    await page.setContent(html(example, index));
    await page.screenshot({ path: file });
  }
  await browser.close();
}

function realImages() {
  const root = 'tests/eval/images-real';
  const files: { id: string; path: string; label: 0 | 1 }[] = [];
  for (const [folder, label] of [['positive', 1], ['negative', 0]] as const) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir))
      if (/\.(png|jpe?g|webp)$/i.test(name))
        files.push({ id: `real:${folder}/${name}`, path: join(dir, name), label });
  }
  return files;
}

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;

await render();
const images = [
  ...withThumbs.map((example) => ({ id: example.id, path: join(thumbs, `${example.id}.png`) })),
  ...realImages(),
];

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int',
  gzip: true,
  cacheMethod: 'none',
});
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, ...ocrParameters });

/** The same two passes as the offscreen document. */
async function ocrPasses(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(Buffer.from(brightTextMask(data, info.width, info.height)), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  const texts = [];
  for (const input of [path, mask])
    texts.push(confidentText((await worker.recognize(input, {}, recognizeOptions)).data));
  return texts.join(' | ');
}

env.allowRemoteModels = false;
env.localModelPath = 'public/models/';
const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'q8' });

const ocr: Record<string, string> = {};
const clip: Record<string, number> = {};
const timing = { ocr: [] as number[], clip: [] as number[] };
for (const image of images) {
  let start = performance.now();
  ocr[image.id] = await ocrPasses(image.path);
  timing.ocr.push(performance.now() - start);
  start = performance.now();
  const inputs = await processor(await RawImage.read(image.path));
  const { image_embeds } = (await model(inputs)) as { image_embeds: { data: Float32Array } };
  clip[image.id] = gtaProbability(image_embeds.data, prompts as PromptEmbeddings);
  timing.clip.push(performance.now() - start);
}
await worker.terminate();

writeFileSync(join(cache, 'ocr.json'), JSON.stringify(ocr, null, 1));
writeFileSync(join(cache, 'clip.json'), JSON.stringify(clip, null, 1));
const summary = Object.fromEntries(
  Object.entries(timing).map(([name, values]) => [
    name,
    { mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length), p95: Math.round(percentile(values, 0.95)) },
  ]),
);
writeFileSync(
  join(cache, 'timing.json'),
  JSON.stringify({ images: images.length, ...summary, real: realImages().map((r) => ({ id: r.id, label: r.label })) }, null, 1),
);
console.log(`Analysed ${images.length} images. Per image (ms):`, summary);
