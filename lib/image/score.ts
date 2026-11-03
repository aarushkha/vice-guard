/**
 * GTA 6 probability from a CLIP image embedding: a logistic-regression
 * classifier trained on image embeddings (scripts/train-clip.ts).
 *
 * It replaced zero-shot text prompts, which on held-out images caught 32% of
 * GTA VI art at a 5% false-block rate against the classifier's 94%.
 */
export interface Classifier {
  model: string;
  dtype: string;
  /** Multiplies the dot product before the bias. */
  scale: number;
  weights: number[];
  bias: number;
}

export function normalizeVector(vector: ArrayLike<number>): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

/** Probability (0-1) that the image shows GTA 6. */
export function gtaProbability(
  imageEmbedding: ArrayLike<number>,
  classifier: Classifier,
): number {
  const image = normalizeVector(imageEmbedding);
  let dot = 0;
  for (let i = 0; i < image.length; i++)
    dot += image[i]! * classifier.weights[i]!;
  return 1 / (1 + Math.exp(-(classifier.scale * dot + classifier.bias)));
}
