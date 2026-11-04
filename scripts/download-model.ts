// One-time developer step: `npm run model`.
// Downloads MobileCLIP-S0's vision encoder from Hugging Face and Tesseract's
// fast English model into public/models, so the extension makes no model
// requests at runtime.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { VISION_FILE } from '../lib/image/clip-files';
import { OCR_MODEL_FILE } from '../lib/image/ocr';

// tessdata_fast reads thumbnail text as well as the "best" model the
// tesseract.js package bundles (better on the eval) in half the time.
const ocrModel = join('public/models', OCR_MODEL_FILE);
if (!existsSync(ocrModel)) {
  const response = await fetch(
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata',
  );
  if (!response.ok) throw new Error(`OCR model: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const sha = createHash('sha256').update(data).digest('hex');
  if (
    sha !== '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'
  )
    throw new Error(`OCR model: unexpected checksum ${sha}`);
  mkdirSync(dirname(ocrModel), { recursive: true });
  writeFileSync(ocrModel, gzipSync(data, { level: 9 }));
  console.log(`Downloaded ${ocrModel}`);
}

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
