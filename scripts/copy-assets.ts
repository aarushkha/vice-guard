// Copies the local OCR and CLIP runtime files into public/ before a build:
// `npm run assets`. Nothing here is fetched from a CDN at runtime.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { VISION_FILE } from '../lib/image/clip-files';
import { OCR_MODEL_FILE } from '../lib/image/ocr';
import { dirname, join } from 'node:path';

// Some packages do not export package.json, so resolve their folders directly.
const packageDir = (name: string) => join('node_modules', name);

const copies: [from: string, to: string][] = [
  [
    join(packageDir('tesseract.js'), 'dist/worker.min.js'),
    'public/tesseract/worker.min.js',
  ],
  [
    join(packageDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'),
    'public/tesseract/tesseract-core-simd-lstm.wasm.js',
  ],
  // The WebGPU build, which also runs on the CPU when there is no GPU (as
  // fast as the 14 MB CPU-only build, measured).
  [
    join(
      packageDir('onnxruntime-web'),
      'dist/ort-wasm-simd-threaded.asyncify.wasm',
    ),
    'public/ort/ort-wasm-simd-threaded.asyncify.wasm',
  ],
  [
    join(
      packageDir('onnxruntime-web'),
      'dist/ort-wasm-simd-threaded.asyncify.mjs',
    ),
    'public/ort/ort-wasm-simd-threaded.asyncify.mjs',
  ],
];

// Only the runtime copied above may be in public/ort, or it is bundled too.
rmSync('public/ort', { recursive: true, force: true });
for (const [from, to] of copies) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

// The OCR model now comes from `npm run model`; drop the old bundled copy.
rmSync('public/tesseract/eng.traineddata.gz', { force: true });
if (!existsSync(join('public/models', OCR_MODEL_FILE)))
  throw new Error(
    `Missing public/models/${OCR_MODEL_FILE}. Run \`npm run model\` to download it.`,
  );

const model = 'public/models/mobileclip_s0';
// Only the shipped encoder may be in public/, or it is bundled too.
for (const file of readdirSync(join(model, 'onnx')))
  if (file !== VISION_FILE) rmSync(join(model, 'onnx', file));
for (const file of [
  'config.json',
  'preprocessor_config.json',
  `onnx/${VISION_FILE}`,
])
  if (!existsSync(join(model, file)))
    throw new Error(
      `Missing ${join(model, file)}. Run \`npm run model\` once to download it.`,
    );
console.log('Copied OCR and CLIP runtime assets into public/.');
