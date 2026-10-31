export type Mode = 'light' | 'balanced' | 'strict';
export interface Settings {
  enabled: boolean;
  mode: Mode;
  spoilerFree: boolean;
  allowReveal: boolean;
  keywords: string[];
}

export const defaults: Settings = {
  enabled: true,
  mode: 'strict',
  spoilerFree: false,
  allowReveal: true,
  keywords: [],
};

export function parseSettings(value: unknown): Settings {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    enabled:
      typeof data.enabled === 'boolean' ? data.enabled : defaults.enabled,
    mode: ['light', 'balanced', 'strict'].includes(String(data.mode))
      ? (data.mode as Mode)
      : defaults.mode,
    spoilerFree:
      typeof data.spoilerFree === 'boolean' ? data.spoilerFree : false,
    allowReveal:
      typeof data.allowReveal === 'boolean'
        ? data.allowReveal
        : defaults.allowReveal,
    keywords: Array.isArray(data.keywords)
      ? [
          ...new Set(
            data.keywords
              .filter((word): word is string => typeof word === 'string')
              .map((word) => word.trim().slice(0, 120))
              .filter(Boolean),
          ),
        ].slice(0, 200)
      : [],
  };
}
