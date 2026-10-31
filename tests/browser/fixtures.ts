import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface Extension {
  context: BrowserContext;
  popup: Page;
  background: Worker;
  /** Every network request made while the test ran. */
  requests: string[];
}

const fixture = (name: string) => readFileSync(path.resolve('tests/browser/fixtures', name));
/** Image hosts redirected to the local thumbnail server. */
export const imageHosts = ['i.ytimg.com', 'pbs.twimg.com', 'preview.redd.it', 'img.test', 'encrypted-tbn0.gstatic.com'];

/**
 * Serves thumbnails for every image host: URLs containing "GTA" get a
 * thumbnail with "GTA VI ENDING" on it, the rest a neutral one. The offscreen
 * document's fetches cannot be routed by Playwright, so DNS is remapped.
 */
async function startImageServer() {
  const server = createServer(
    { key: fixture('test-key.pem'), cert: fixture('test-cert.pem') },
    (request, response) => {
      const delay = /slow/i.test(request.url ?? '') ? 4000 : 0;
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(fixture(/gta/i.test(request.url ?? '') ? 'thumb-gta.png' : 'thumb-plain.png'));
      }, delay);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

export const test = base.extend<{
  extension: Extension;
  settings: Record<string, unknown>;
}>({
  settings: [{}, { option: true }],
  extension: async ({ settings }, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const images = await startImageServer();
    const port = (images.address() as AddressInfo).port;
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=${imageHosts.map((host) => `MAP ${host} 127.0.0.1:${port}`).join(',')}`,
        '--ignore-certificate-errors',
      ],
    });
    const requests: string[] = [];
    context.on('request', (request) => requests.push(request.url()));
    const errors: Error[] = [];
    context.on('weberror', (event) => errors.push(event.error()));
    try {
      const background =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = new URL(background.url()).host;
      if (Object.keys(settings).length)
        await background.evaluate(
          (value) => chrome.storage.local.set({ settings: value }),
          settings,
        );
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 350, height: 700 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(
        popup.getByRole('checkbox', { name: 'Enable spoiler protection' }),
      ).toBeEnabled();
      await use({ context, popup, background, requests });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      images.close();
    }
  },
});

/**
 * Serves `html` at `url` (any real hostname, so the matching site module
 * runs) and records every animation frame in which a card marked
 * data-expect="hide" was rendered visibly.
 */
export async function openFixture(
  context: BrowserContext,
  url: string,
  html: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const flashes: string[] = [];
    (window as unknown as { __flashes: string[] }).__flashes = flashes;
    const check = () => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-expect="hide"]')) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          box.width > 0 &&
          box.height > 0 &&
          !element.closest('[data-vg-hit]') &&
          (element.textContent ?? '').trim()
        )
          flashes.push((element.textContent ?? '').trim().slice(0, 60));
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html>${html}` }),
  );
  await page.goto(url);
  return page;
}

/** Per-card outcome against the fixture's data-expect labels. */
export async function outcomes(page: Page) {
  return page.evaluate(() => {
    const result = { tp: 0, fn: 0, fp: 0, tn: 0, misses: [] as string[], falsePositives: [] as string[] };
    for (const element of document.querySelectorAll<HTMLElement>('[data-expect]')) {
      const style = getComputedStyle(element);
      const hidden =
        style.display === 'none' ||
        !!element.closest('[data-vg-hit]') ||
        element.getBoundingClientRect().height === 0;
      const label = element.dataset.expect === 'hide';
      const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (label && hidden) result.tp++;
      if (label && !hidden) (result.fn++, result.misses.push(text));
      if (!label && hidden) (result.fp++, result.falsePositives.push(text));
      if (!label && !hidden) result.tn++;
    }
    return result;
  });
}

export async function flashes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __flashes: string[] }).__flashes);
}

export { expect };
