import { browser } from 'wxt/browser';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ImageResult } from '../../lib/engine/engine';
import {
  brightTextMask,
  confidentText,
  ocrParameters,
  recognizeOptions,
} from '../../lib/image/ocr';
import type { EngineStatus, OffscreenMessage } from '../../lib/messages';

// Everything loads from the extension package; nothing is fetched remotely
// except the image itself, from the host the page already loaded it from.
const asset = (path: string) => browser.runtime.getURL(path as '/');
const status: EngineStatus = { ocr: 'loading', clip: 'loading' };
const report = () =>
  void browser.runtime
    .sendMessage({ target: 'background', type: 'vg:engine', status })
    .catch(() => undefined);

const OCR_WORKERS = 2;
const ocrWorkers = Promise.all(
  Array.from({ length: OCR_WORKERS }, async () => {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: asset('/tesseract/worker.min.js'),
      corePath: asset('/tesseract/tesseract-core-simd-lstm.wasm.js'),
      langPath: asset('/tesseract/'),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
    });
    // Thumbnails have scattered display text, not paragraphs.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, ...ocrParameters });
    return worker;
  }),
);
ocrWorkers.then(
  () => ((status.ocr = 'ready'), report()),
  (error: unknown) => ((status.ocr = 'error'), (status.error = String(error)), report()),
);

let nextOcr = 0;
/** Two passes: the image as-is, and with bright overlay text isolated. */
async function ocr(image: OffscreenCanvas, pixels: ImageData): Promise<string> {
  const workers = await ocrWorkers;
  const mask = new OffscreenCanvas(image.width, image.height);
  mask
    .getContext('2d')!
    .putImageData(
      new ImageData(brightTextMask(pixels.data, image.width, image.height), image.width, image.height),
      0,
      0,
    );
  const texts = await Promise.all(
    [image, mask].map(async (canvas) => {
      const worker = workers[nextOcr++ % workers.length]!;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const { data } = await worker.recognize(blob, {}, recognizeOptions);
      return confidentText(data);
    }),
  );
  return texts.join(' | ');
}

const clipWorker = new Worker(new URL('./clip-worker.ts', import.meta.url), {
  type: 'module',
});
const pending = new Map<number, (result: { score?: number; error?: string }) => void>();
let nextId = 0;
clipWorker.onmessage = (event: MessageEvent) => {
  const data = event.data as { type: string; id?: number; score?: number; error?: string };
  if (data.type === 'ready') status.clip = 'ready';
  if (data.type === 'error') ((status.clip = 'error'), (status.error = data.error));
  if (data.type !== 'result') return report();
  pending.get(data.id!)?.(data);
  pending.delete(data.id!);
};
function clip(pixels: ImageData): Promise<{ score?: number; error?: string }> {
  if (status.clip === 'error') return Promise.resolve({ error: status.error });
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    clipWorker.postMessage({ id, pixels });
  });
}

async function analyze(url: string): Promise<ImageResult> {
  const response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const bitmap = await createImageBitmap(await response.blob());
  // OCR reads small thumbnail text better at 2x; CLIP resizes to 256 itself.
  const scale = Math.min(2, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  const [text, vision] = await Promise.all([
    status.ocr === 'error' ? Promise.resolve('') : ocr(canvas, pixels),
    clip(pixels),
  ]);
  if (status.ocr === 'error' && vision.error) return { error: vision.error };
  return { ocr: text, clip: vision.score, error: undefined };
}

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as Partial<OffscreenMessage>;
  if (message.target !== 'offscreen' || message.type !== 'vg:analyze') return;
  analyze(message.url!)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ error: String(error) }));
  return true;
});
report();
