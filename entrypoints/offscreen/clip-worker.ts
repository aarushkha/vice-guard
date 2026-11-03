import { loadClip } from '../../lib/image/clip-model';
import type { Classifier } from '../../lib/image/score';
import classifier from '../../lib/image/classifier.json';

// Runs CLIP in its own thread; requests are handled one at a time.
const ready = loadClip(
  new URL('/', self.location.href).href,
  classifier as Classifier,
);
ready.then(
  () => self.postMessage({ type: 'ready' }),
  (error: unknown) => self.postMessage({ type: 'error', error: String(error) }),
);

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; pixels: ImageData }>) => {
  const { id, pixels } = event.data;
  queue = queue.then(async () => {
    try {
      const score = await (await ready)(pixels);
      self.postMessage({ type: 'result', id, score });
    } catch (error) {
      self.postMessage({ type: 'result', id, error: String(error) });
    }
  });
};
