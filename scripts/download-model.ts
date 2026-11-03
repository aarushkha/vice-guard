// One-time developer step: `npm run model`.
// Downloads MobileCLIP-S0's vision encoder from Hugging Face into
// public/models, so the extension makes no model requests at runtime.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { VISION_FILE } from '../lib/image/clip-files';

const repo = 'Xenova/mobileclip_s0';
const out = 'public/models/mobileclip_s0';

// The int8 builds (vision_model_quantized / _int8 / _uint8) are broken for
// this model: their image embeddings barely relate to anything (a music
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
console.log('Model files are in place.');
