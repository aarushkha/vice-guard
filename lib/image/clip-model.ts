import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { gtaProbability, type Classifier } from './score';

import { CLIP_DTYPE, CLIP_MODEL } from './clip-files';

export { CLIP_DTYPE, CLIP_MODEL, VISION_FILE } from './clip-files';

export type ClipDevice = 'webgpu' | 'wasm';
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Loads MobileCLIP-S0's fp16 vision encoder from the extension package.
 * `base` is where models/ and ort/ are served from; remote fetches are off.
 */
export async function loadClip(
  base: string,
  classifier: Classifier,
  device: ClipDevice = 'wasm',
) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.localModelPath = `${base}models/`;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = `${base}ort/`;
    // Single-threaded: offscreen documents are not cross-origin isolated, and
    // measured on 4 cores, two single-threaded workers out-run threaded ones
    // because OCR competes for the same cores.
    wasm.numThreads = 1;
    wasm.proxy = false;
  }
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(CLIP_MODEL),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
      dtype: CLIP_DTYPE,
      device,
    }),
  ]);
  const embed = async (pixels: Pixels): Promise<Float32Array> => {
    const image = new RawImage(pixels.data, pixels.width, pixels.height, 4);
    const inputs = await processor(image);
    const { image_embeds } = (await model(inputs)) as {
      image_embeds: { data: Float32Array };
    };
    return image_embeds.data;
  };
  return {
    embed,
    score: async (pixels: Pixels) =>
      gtaProbability(await embed(pixels), classifier),
  };
}
