import type { AuditEntry } from './audit';
import type { Observation } from './channels';
import type { ImageResult } from './engine/engine';

/** Content script → background. */
export type ContentMessage =
  | { type: 'vg:count'; count: number }
  | { type: 'vg:health'; broken: boolean; site: string }
  | { type: 'vg:audit'; entries: AuditEntry[] }
  | { type: 'vg:sources'; observations: Observation[] }
  | { type: 'vg:image'; url: string };

/** Background → offscreen document. */
export type OffscreenMessage = {
  target: 'offscreen';
  type: 'vg:analyze';
  url: string;
};
export type OffscreenStatus = { target: 'background'; type: 'vg:engine'; status: EngineStatus };

export interface EngineStatus {
  ocr: 'loading' | 'ready' | 'error';
  clip: 'loading' | 'ready' | 'error';
  error?: string;
}

export type { ImageResult };
