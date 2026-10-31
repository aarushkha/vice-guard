import { browser } from 'wxt/browser';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ImageResult } from '../../lib/engine/engine';
import {
  brightTextMask,
  confidentText,
  OCR_MAX_SIDE,
  OCR_SCALE,
  ocrParameters,
  recognizeOptions,
} from '../../lib/image/ocr';
import type { EngineStatus, OffscreenMessage } from '../../lib/messages';

// Everything loads from the extension package; nothing is fetched remotely
// except the image itself, from the host the page already loaded it from.
const asset = (path: string) => browser.runtime.getURL(path as '/');
const status: EngineStatus = { ocr: 'loading', clip: 'loading' };
const started = performance.now();
const since = (start: number) => Math.round(performance.now() - start);
const report = () =>
  void browser.runtime
    .sendMessage({ target: 'background', type: 'vg:engine', status })
    .catch(() => undefined);

// Measured on 4 cores: two OCR and two single-threaded CLIP workers give the
// best throughput (OCR and CLIP run side by side per image). More cores get
// up to three of each.
const cores = navigator.hardwareConcurrency || 4;
const WORKERS = Math.max(1, Math.min(3, cores - 2));
const OCR_WORKERS = WORKERS;
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
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      ...ocrParameters,
    });
    return worker;
  }),
);
ocrWorkers.then(
  () => (
    (status.ocr = 'ready'),
    (status.ocrReadyMs = since(started)),
    report()
  ),
  (error: unknown) => (
    (status.ocr = 'error'),
    (status.error = String(error)),
    report()
  ),
);

let nextOcr = 0;
/** Two passes: the image as-is, and with bright overlay text isolated. */
async function ocr(image: OffscreenCanvas, pixels: ImageData): Promise<string> {
  const workers = await ocrWorkers;
  const mask = new OffscreenCanvas(image.width, image.height);
  mask
    .getContext('2d')!
    .putImageData(
      new ImageData(
        brightTextMask(pixels.data, image.width, image.height),
        image.width,
        image.height,
      ),
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

// Single-threaded wasm (offscreen documents are not cross-origin isolated),
// so throughput comes from separate workers, each with its own session.
const CLIP_WORKERS = WORKERS;
const pending = new Map<
  number,
  (result: { score?: number; error?: string }) => void
>();
const load = new Map<Worker, number>();
let readyCount = 0;
const clipWorkers = Array.from({ length: CLIP_WORKERS }, () => {
  const worker = new Worker(new URL('./clip-worker.ts', import.meta.url), {
    type: 'module',
  });
  load.set(worker, 0);
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      id?: number;
      score?: number;
      error?: string;
    };
    if (data.type === 'ready' && ++readyCount === 1)
      ((status.clip = 'ready'), (status.clipReadyMs = since(started)));
    if (data.type === 'error')
      ((status.clip = 'error'), (status.error = data.error));
    if (data.type !== 'result') return report();
    load.set(worker, load.get(worker)! - 1);
    pending.get(data.id!)?.(data);
    pending.delete(data.id!);
  };
  return worker;
});
let nextId = 0;
function clip(pixels: ImageData): Promise<{ score?: number; error?: string }> {
  if (status.clip === 'error') return Promise.resolve({ error: status.error });
  const id = nextId++;
  // Least-loaded worker.
  const worker = clipWorkers.reduce((a, b) =>
    load.get(b)! < load.get(a)! ? b : a,
  );
  load.set(worker, load.get(worker)! + 1);
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, pixels });
  });
}

async function analyze(url: string): Promise<ImageResult> {
  const start = performance.now();
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'force-cache',
  });
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const bitmap = await createImageBitmap(await response.blob());
  // OCR reads small thumbnail text better upscaled; CLIP resizes to 256 itself.
  const scale = Math.min(
    OCR_SCALE,
    OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  const fetched = since(start);
  const timed = async <T>(task: Promise<T>): Promise<[T, number]> => {
    const begin = performance.now();
    const value = await task;
    return [value, since(begin)];
  };
  const [[text, ocrMs], [vision, clipMs]] = await Promise.all([
    timed(status.ocr === 'error' ? Promise.resolve('') : ocr(canvas, pixels)),
    timed(clip(pixels)),
  ]);
  if (status.ocr === 'error' && vision.error) return { error: vision.error };
  return {
    ocr: text,
    clip: vision.score,
    error: undefined,
    timing: { fetch: fetched, ocr: ocrMs, clip: clipMs, total: since(start) },
  };
}

// Jobs run CLIP_WORKERS at a time. Images whose cards are on screen go
// first, most recently shown first, so cards the user already scrolled past
// do not hold up the ones in view. The rest are prefetches, in order.
interface Job {
  url: string;
  /** When the card came on screen; 0 while it is only a prefetch. */
  visibleAt: number;
  resolve(result: ImageResult): void;
}
const queue: Job[] = [];
let running = 0;
function pump() {
  while (running < CLIP_WORKERS && queue.length) {
    let index = 0;
    for (let i = 1; i < queue.length; i++)
      if (queue[i]!.visibleAt > queue[index]!.visibleAt) index = i;
    const job = queue.splice(index, 1)[0]!;
    running++;
    analyze(job.url)
      .catch((error: unknown) => ({ error: String(error) }))
      .then((result) => {
        running--;
        job.resolve(result);
        pump();
      });
  }
}

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as OffscreenMessage;
  if (message.target !== 'offscreen') return;
  if (message.type === 'vg:prioritize') {
    const now = performance.now();
    for (const job of queue)
      if (message.urls.includes(job.url)) job.visibleAt = now;
    return;
  }
  queue.push({ url: message.url, visibleAt: 0, resolve: sendResponse });
  pump();
  return true;
});
report();
