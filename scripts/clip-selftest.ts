// Writes lib/image/clip-selftest.json: the CPU embedding of the self-test
// pattern, which a GPU must reproduce before it is used for CLIP. Rerun only
// when the CLIP model changes: `npx jiti scripts/clip-selftest.ts`.
import { writeFileSync } from 'node:fs';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { CLIP_DTYPE, CLIP_MODEL } from '../lib/image/clip-files';
import { selfTestPixels } from '../lib/image/clip-selftest';
import { normalizeVector } from '../lib/image/score';

env.allowRemoteModels = false;
env.localModelPath = 'public/models/';
const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
  dtype: CLIP_DTYPE,
});
const { data, width, height } = selfTestPixels();
const { image_embeds } = (await model(
  await processor(new RawImage(data, width, height, 4)),
)) as { image_embeds: { data: Float32Array } };
writeFileSync(
  'lib/image/clip-selftest.json',
  `${JSON.stringify(normalizeVector(image_embeds.data).map((v) => Math.round(v * 1e4) / 1e4))}\n`,
);
console.log('Wrote lib/image/clip-selftest.json');
