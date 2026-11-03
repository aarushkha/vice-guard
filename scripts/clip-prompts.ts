// One-time developer step: `npm run model`.
// Downloads MobileCLIP-S0 from Hugging Face into public/models (vision encoder
// only is shipped) and precomputes the prompt text embeddings, so the text
// model never ships and the extension makes no model requests at runtime.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
  env,
} from '@huggingface/transformers';
import { VISION_FILE } from '../lib/image/clip-files';
import {
  negativePrompts,
  normalizeVector,
  positivePrompts,
} from '../lib/image/score';

const repo = 'Xenova/mobileclip_s0';
const out = 'public/models/mobileclip_s0';
env.cacheDir = '.model-cache';

// The int8 builds (vision_model_quantized / _int8 / _uint8) are broken for
// this model: their image embeddings barely relate to the text ones (a music
// video thumbnail matched "a photo of a cat" best). fp16 matches fp32 to
// three decimals at half the size and runs on onnxruntime-web's CPU backend.
for (const file of [
  'config.json',
  'preprocessor_config.json',
  `onnx/${VISION_FILE}`,
]) {
  const target = join(out, file);
  if (existsSync(target)) continue;
  const response = await fetch(
    `https://huggingface.co/${repo}/resolve/main/${file}`,
  );
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${target}`);
}

const tokenizer = await AutoTokenizer.from_pretrained(repo);
// Build time only, so the full-precision text model costs nothing to ship.
const model = await CLIPTextModelWithProjection.from_pretrained(repo, {
  dtype: 'fp32',
});
async function embed(prompts: string[]) {
  const inputs = tokenizer(prompts, {
    padding: 'max_length',
    truncation: true,
  });
  const { text_embeds } = (await model(inputs)) as {
    text_embeds: { data: Float32Array; dims: number[] };
  };
  const size = text_embeds.dims[1]!;
  return prompts.map((prompt, i) => ({
    prompt,
    embedding: normalizeVector(
      text_embeds.data.slice(i * size, (i + 1) * size),
    ).map((value) => Math.round(value * 1e5) / 1e5),
  }));
}
writeFileSync(
  'lib/image/prompts.json',
  `${JSON.stringify({
    model: repo,
    logitScale: 100,
    positive: await embed(positivePrompts),
    negative: await embed(negativePrompts),
  })}\n`,
);
console.log('Wrote lib/image/prompts.json');
