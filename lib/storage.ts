import { browser } from 'wxt/browser';
import { parseSettings, type Settings } from './settings';

export async function readSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return parseSettings(result.settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings: parseSettings(settings) });
}

export function watchSettings(
  callback: (settings: Settings) => void,
): () => void {
  const listener: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, area) => {
    if (area === 'local' && changes.settings)
      callback(parseSettings(changes.settings.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
