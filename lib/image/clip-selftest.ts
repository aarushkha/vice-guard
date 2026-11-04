import expected from './clip-selftest.json';
import { normalizeVector } from './score';

/**
 * A fixed 256x256 RGBA pattern. Its CLIP embedding, computed on the CPU by
 * `npm run model`, is in clip-selftest.json. A GPU is only trusted if it
 * produces the same embedding: a driver that runs the model but computes
 * nonsense would otherwise silently stop every image verdict.
 */
export function selfTestPixels() {
  const size = 256;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = ((x >> 4) ^ (y >> 4)) & 1 ? 230 : 25;
      data[i + 3] = 255;
    }
  return { data, width: size, height: size };
}

/** Cosine similarity of an embedding with the CPU reference. */
export function selfTestSimilarity(embedding: ArrayLike<number>): number {
  const a = normalizeVector(embedding);
  const b = normalizeVector(expected as number[]);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * (b[i] ?? 0);
  return dot;
}
