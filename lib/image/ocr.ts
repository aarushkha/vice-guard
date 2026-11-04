interface Word {
  text: string;
  confidence: number;
}
interface RecognizeData {
  text: string;
  blocks?: { paragraphs: { lines: { words: Word[] }[] }[] }[] | null;
}

/**
 * Every recognised word. Low-confidence words are kept on purpose: the text
 * matcher is the filter, and noise rarely spells a GTA term.
 */
export function confidentText(data: RecognizeData, minConfidence = 0): string {
  if (!data.blocks) return data.text;
  return data.blocks
    .flatMap((block) =>
      block.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
    )
    .filter((word) => word.confidence >= minConfidence)
    .map((word) => word.text)
    .join(' ');
}

/**
 * Thumbnails are upscaled this much before OCR. Measured on the eval set
 * (480 px wide thumbnails, recall with the title): 1.0x 88.1%, 1.25x 94.0%,
 * 1.5x 94.0% at 30% more OCR time, 2x 94.0%. Smaller sources (320 px
 * mqdefault) lose recall at any scale.
 */
export const OCR_SCALE = 1.25;
/** Longest side after scaling, so large images do not cost more. */
export const OCR_MAX_SIDE = 900;

/** Tesseract's fast English model, under public/models (`npm run model`). */
export const OCR_MODEL_DIR = 'tesseract';
export const OCR_MODEL_FILE = `${OCR_MODEL_DIR}/eng.traineddata.gz`;

/** Tesseract options shared by the extension and the eval. */
export const recognizeOptions = { blocks: true } as const;
export const ocrParameters = {
  user_defined_dpi: '300',
  // Tesseract writes debug notes ("Detected 14 diacritics") to stderr, which
  // Chrome lists as extension errors. Send them nowhere.
  debug_file: '/dev/null',
} as const;

/**
 * Thumbnail text is usually white or yellow with a dark outline. Painting
 * those pixels black on white lets Tesseract read it off busy backgrounds.
 * Input is RGBA; output is one grey byte per pixel.
 */
export function brightTextMask(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const text =
      (r > 200 && g > 200 && b > 200) || (r > 200 && g > 190 && b < 110);
    out[p] = text ? 0 : 255;
  }
  return out;
}

/** RGBA to one grey byte per pixel (Rec. 601 luma, as Leptonica uses). */
export function grayscale(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4)
    out[p] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  return out;
}

/**
 * Wraps grey pixels as a binary PGM file. Tesseract needs an encoded image;
 * PGM costs nothing to write or read, where PNG is compressed and inflated
 * again for every pass.
 */
export function pgm(gray: Uint8Array, width: number, height: number) {
  const header = new TextEncoder().encode(`P5\n${width} ${height}\n255\n`);
  const file = new Uint8Array(header.length + gray.length);
  file.set(header);
  file.set(gray, header.length);
  return file;
}
