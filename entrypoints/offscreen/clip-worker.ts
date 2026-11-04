import { loadClip, type ClipDevice } from '../../lib/image/clip-model';
import {
  selfTestPixels,
  selfTestSimilarity,
} from '../../lib/image/clip-selftest';
import type { Classifier } from '../../lib/image/score';
import classifier from '../../lib/image/classifier.json';

// Runs CLIP in its own thread; requests are handled one at a time. The
// offscreen document says which device to try first (init message).
type Model = Awaited<ReturnType<typeof loadClip>>;
const base = new URL('/', self.location.href).href;

/**
 * Loads the model on `device` and checks it against the CPU reference on a
 * test image. A worker whose GPU attempt fails is replaced by the offscreen
 * document (onnxruntime cannot switch backends in the same thread).
 */
async function start(device: ClipDevice): Promise<Model> {
  const model = await loadClip(base, classifier as Classifier, device);
  // Also the warm-up: the first run is slow, better before any card waits.
  const similarity = selfTestSimilarity(await model.embed(selfTestPixels()));
  if (similarity < 0.99)
    throw new Error(
      `${device} disagrees with the CPU reference (similarity ${similarity.toFixed(3)})`,
    );
  self.postMessage({ type: 'ready', device });
  return model;
}

let ready: Promise<Model> | undefined;
let queue = Promise.resolve();
self.onmessage = (
  event: MessageEvent<
    | { type: 'init'; device: ClipDevice }
    | { type: 'run'; id: number; pixels: ImageData }
  >,
) => {
  const message = event.data;
  if (message.type === 'init') {
    ready = start(message.device);
    ready.catch((error: unknown) =>
      self.postMessage({ type: 'error', error: String(error) }),
    );
    // Results wait for this; a rejected model must not reject them twice.
    ready.catch(() => undefined);
    return;
  }
  const { id, pixels } = message;
  queue = queue.then(async () => {
    try {
      const score = await (await ready!).score(pixels);
      self.postMessage({ type: 'result', id, score });
    } catch (error) {
      self.postMessage({ type: 'result', id, error: String(error) });
    }
  });
};
