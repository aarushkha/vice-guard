declare const __LITE__: boolean | undefined;

/**
 * The text-only "Vice Guard Lite" build (`npm run build:lite`): no OCR, no
 * CLIP, no offscreen document. Defined by wxt.config.ts; false elsewhere.
 */
export const LITE: boolean = typeof __LITE__ !== 'undefined' && __LITE__;
