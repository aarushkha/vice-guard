import { browser } from 'wxt/browser';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ImageResult } from '../../lib/engine/engine';
import {
  brightTextMask,
  confidentText,
  grayscale,
  OCR_MAX_SIDE,
  OCR_MODEL_DIR,
  OCR_SCALE,
  ocrParameters,
  pgm,
  recognizeOptions,
} from '../../lib/image/ocr';
import { letterbox } from '../../lib/image/letterbox';
import type { ClipDevice } from '../../lib/image/clip-model';
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
// Anything that goes wrong here is otherwise invisible; the popup shows it.
const noteCrash = (text: string) => {
  status.crashes = [...(status.crashes ?? []), text.slice(0, 300)].slice(-3);
  report();
};
addEventListener('error', (event) => noteCrash(String(event.message)));
// A model that never finishes loading would otherwise just say "loading".
setTimeout(() => {
  for (const part of ['ocr', 'clip'] as const)
    if (status[part] === 'loading')
      noteCrash(
        `${part === 'ocr' ? 'Text reader' : 'Image check'} still loading after 60 s`,
      );
}, 60_000);
addEventListener('unhandledrejection', (event) =>
  noteCrash(String((event as PromiseRejectionEvent).reason)),
);

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
      langPath: asset(`/models/${OCR_MODEL_DIR}/`),
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

/**
 * OCR passes, run by whichever worker is free. A quick pass (bright text
 * isolated, a mostly blank image) decides when a card can be shown; a full
 * pass over the whole picture only adds to what the slow half reports, so it
 * runs after every waiting quick pass.
 */
interface OcrTask {
  job: Job;
  quick: boolean;
  image: Uint8Array;
  resolve(text: string): void;
}
const ocrQueue: OcrTask[] = [];
let idleOcr: Awaited<typeof ocrWorkers> = [];
void ocrWorkers.then((workers) => ((idleOcr = [...workers]), pumpOcr()));
function pumpOcr() {
  while (idleOcr.length && ocrQueue.length) {
    let index = 0;
    for (let i = 1; i < ocrQueue.length; i++) {
      const [a, b] = [ocrQueue[i]!, ocrQueue[index]!];
      if (a.quick !== b.quick ? a.quick : a.job.visibleAt > b.job.visibleAt)
        index = i;
    }
    const task = ocrQueue.splice(index, 1)[0]!;
    const worker = idleOcr.pop()!;
    // Raw bytes are accepted in the browser too; the typings only say Buffer.
    void worker
      .recognize(task.image as Buffer, {}, recognizeOptions)
      .then(
        ({ data }) => confidentText(data),
        () => '',
      )
      .then((text) => {
        idleOcr.push(worker);
        task.resolve(text);
        pumpOcr();
        pumpClip();
      });
  }
}
function ocr(job: Job, quick: boolean, image: Uint8Array): Promise<string> {
  if (status.ocr === 'error') return Promise.resolve('');
  return new Promise((resolve) => {
    ocrQueue.push({ job, quick, image, resolve });
    pumpOcr();
  });
}

// CLIP runs on the GPU when there is one (WebGPU, one worker: the GPU runs
// one model at a time anyway, and the CPU is left to OCR). Otherwise on
// single-threaded wasm (offscreen documents are not cross-origin isolated),
// where throughput comes from separate workers, each with its own session.
let readyCount = 0;
interface ClipResult {
  score?: number;
  error?: string;
  /** Time on a worker, not counting the wait in the queue. */
  ms?: number;
}
interface ClipTask {
  job: Job;
  pixels: ImageData;
  started?: number;
  resolve(result: ClipResult): void;
}
const idleClip: Worker[] = [];
const clipQueue: ClipTask[] = [];
const clipRunning = new Map<Worker, ClipTask>();
function addClipWorker(device: ClipDevice) {
  const worker = new Worker(new URL('./clip-worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.postMessage({ type: 'init', device });
  worker.onerror = (event) =>
    noteCrash(`CLIP worker: ${event.message || 'failed to start'}`);
  idleClip.push(worker);
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      score?: number;
      error?: string;
      device?: ClipDevice;
    };
    if (data.type === 'ready' && ++readyCount === 1)
      ((status.clip = 'ready'),
        (status.clipReadyMs = since(started)),
        (status.clipDevice = data.device));
    if (data.type === 'error' && device === 'webgpu') {
      // No usable GPU after all: replace this worker with CPU workers and
      // give back whatever it was handed.
      status.clipNote = `GPU not used: ${data.error}`;
      worker.terminate();
      if (idleClip.includes(worker))
        idleClip.splice(idleClip.indexOf(worker), 1);
      const task = clipRunning.get(worker);
      if (task) (clipRunning.delete(worker), clipQueue.push(task));
      for (let i = 0; i < WORKERS; i++) addClipWorker('wasm');
      return report();
    }
    if (data.type === 'error')
      ((status.clip = 'error'), (status.error = data.error));
    if (data.type !== 'result') return report();
    const task = clipRunning.get(worker);
    task?.resolve({ ...data, ms: since(task.started ?? 0) });
    clipRunning.delete(worker);
    idleClip.push(worker);
    pumpClip();
  };
  pumpClip();
}
void (async () => {
  const adapter = await (
    navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
  ).gpu
    ?.requestAdapter()
    .catch(() => null);
  if (adapter) addClipWorker('webgpu');
  else {
    status.clipNote =
      'Chrome offers no GPU (check chrome://gpu for "WebGPU: Hardware accelerated").';
    for (let i = 0; i < WORKERS; i++) addClipWorker('wasm');
  }
})();
/** CLIP has its own queue, on-screen images first. */
function pumpClip() {
  while (idleClip.length && clipQueue.length) {
    let index = 0;
    for (let i = 1; i < clipQueue.length; i++)
      if (clipQueue[i]!.job.visibleAt > clipQueue[index]!.job.visibleAt)
        index = i;
    // On the CPU, CLIP that no card waits for yields to queued quick OCR
    // passes: those decide when cards can be shown, on the same cores.
    if (
      !clipQueue[index]!.job.wait &&
      status.clipDevice !== 'webgpu' &&
      ocrQueue.some((task) => task.quick)
    )
      return;
    const task = clipQueue.splice(index, 1)[0]!;
    const worker = idleClip.pop()!;
    clipRunning.set(worker, task);
    task.started = performance.now();
    worker.postMessage({ type: 'run', id: 0, pixels: task.pixels });
  }
}
function clip(job: Job, pixels: ImageData): Promise<ClipResult> {
  if (status.clip === 'error') return Promise.resolve({ error: status.error });
  return new Promise((resolve) => {
    clipQueue.push({ job, pixels, resolve });
    pumpClip();
  });
}

interface Loaded {
  /** OCR inputs as PGM files: bright text isolated, and the whole image. */
  mask: Uint8Array;
  gray: Uint8Array;
  /** A small copy for CLIP, which resizes to 256 px anyway. */
  clipPixels: ImageData;
  fetchMs: number;
}

interface Crop {
  y: number;
  width: number;
  height: number;
}

function scaled(bitmap: ImageBitmap, crop: Crop, scale: number) {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(crop.width * scale)),
    Math.max(1, Math.round(crop.height * scale)),
  );
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(
    bitmap,
    0,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Downloads and decodes one image: scaled up for OCR, down for CLIP. */
async function download(url: string): Promise<Loaded> {
  const start = performance.now();
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  // Cut black letterbox bars (a quarter of a 16:9 video's hqdefault.jpg).
  const full = scaled(
    bitmap,
    { y: 0, width: bitmap.width, height: bitmap.height },
    1,
  );
  const bars = letterbox(full.data, bitmap.width, bitmap.height);
  const crop = {
    y: bars.top,
    width: bitmap.width,
    height: bitmap.height - bars.top - bars.bottom,
  };
  // OCR reads small thumbnail text better upscaled.
  const pixels = scaled(
    bitmap,
    crop,
    Math.min(OCR_SCALE, OCR_MAX_SIDE / Math.max(crop.width, crop.height)),
  );
  const clipPixels = scaled(
    bitmap,
    crop,
    Math.min(1, 256 / Math.min(crop.width, crop.height)),
  );
  bitmap.close();
  const { data, width, height } = pixels;
  return {
    mask: pgm(brightTextMask(data, width, height), width, height),
    gray: pgm(grayscale(data, width, height), width, height),
    clipPixels,
    fetchMs: since(start),
  };
}

/** Slow halves (full OCR pass and CLIP) of results already answered, by URL. */
const lateClip = new Map<string, Promise<ImageResult>>();

/**
 * Queues both OCR passes and CLIP. Resolves after the quick OCR pass, with
 * clipPending set; the rest is collected with a vg:clip message.
 */
function analyze(job: Job, { mask, gray, clipPixels, fetchMs }: Loaded) {
  const start = performance.now();
  const quick = ocr(job, true, mask);
  const full = ocr(job, false, gray);
  const vision = clip(job, clipPixels);
  lateClip.set(
    job.url,
    Promise.all([quick, full, vision]).then(([quickText, fullText, result]) =>
      result.error
        ? { error: result.error }
        : {
            ocr: [quickText, fullText].filter(Boolean).join(' | '),
            clip: result.score,
            timing: {
              fetch: fetchMs,
              ocr: since(start),
              clip: result.ms ?? 0,
              total: fetchMs + since(start),
            },
          },
    ),
  );
  return quick.then((text): ImageResult => ({ ocr: text, clipPending: true }));
}

// Downloads start as soon as a request arrives (network time would otherwise
// sit inside a compute slot); OCR runs OCR_WORKERS images at a time on images
// that have arrived. Cards on screen go first, most recently shown first, so
// cards the user already scrolled past do not hold up the ones in view.
const MAX_DOWNLOADS = 8;
interface Job {
  url: string;
  /** When the card came on screen; 0 while it is only a prefetch. */
  visibleAt: number;
  /** Its card stays blank until CLIP answers too. */
  wait: boolean;
  resolve(result: ImageResult): void;
}
const queue: Job[] = [];
/** Every job not yet finished with CLIP, for priority updates. */
const live = new Map<string, Job>();
/** Priorities that arrived before their request. */
const shownEarly = new Map<string, number>();
let downloading = 0;
const byPriority = (a: Job, b: Job) => b.visibleAt - a.visibleAt;

/** Starts downloads, highest priority first; analysis starts on arrival. */
function pump() {
  for (const job of [...queue].sort(byPriority)) {
    if (downloading >= MAX_DOWNLOADS) break;
    queue.splice(queue.indexOf(job), 1);
    downloading++;
    const loaded = download(job.url).finally(() => (downloading--, pump()));
    loaded
      .then(
        (loaded) => analyze(job, loaded),
        (error: unknown): ImageResult => ({ error: String(error) }),
      )
      .catch((error: unknown): ImageResult => ({ error: String(error) }))
      .then((result) => {
        job.resolve(result);
        const rest = lateClip.get(job.url);
        if (rest) void rest.finally(() => live.delete(job.url));
        else live.delete(job.url);
      });
  }
}

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as OffscreenMessage;
  if (message.target !== 'offscreen') return;
  if (message.type === 'vg:clip') {
    const result = lateClip.get(message.url);
    lateClip.delete(message.url);
    void (result ?? Promise.resolve({ error: 'no pending clip' })).then(
      sendResponse,
    );
    return true;
  }
  if (message.type === 'vg:status') {
    sendResponse(status);
    return;
  }
  if (message.type === 'vg:prioritize') {
    const now = performance.now();
    for (const url of message.urls) {
      const job = live.get(url);
      if (job) job.visibleAt = now;
      // The request itself can arrive after this (the background checks its
      // cache first); remember the priority for it.
      else shownEarly.set(url, now);
    }
    pump();
    return;
  }
  const early = shownEarly.get(message.url) ?? 0;
  shownEarly.delete(message.url);
  const job: Job = {
    url: message.url,
    visibleAt: early,
    wait: message.wait,
    resolve: sendResponse,
  };
  queue.push(job);
  live.set(job.url, job);
  pump();
  return true;
});
report();
