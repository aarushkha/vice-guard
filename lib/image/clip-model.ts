import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { gtaProbability, type PromptEmbeddings } from './score';

export const CLIP_MODEL = 'mobileclip_s0';

/**
 * Loads MobileCLIP-S0's int8 vision encoder from the extension package.
 * `base` is where models/ and ort/ are served from; remote fetches are off.
 */
export async function loadClip(base: string, prompts: PromptEmbeddings) {
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
      dtype: 'q8',
      device: 'wasm',
    }),
  ]);
  return async (pixels: ImageData): Promise<number> => {
    const image = new RawImage(pixels.data, pixels.width, pixels.height, 4);
    const inputs = await processor(image);
    const { image_embeds } = (await model(inputs)) as {
      image_embeds: { data: Float32Array };
    };
    return gtaProbability(image_embeds.data, prompts);
  };
}
