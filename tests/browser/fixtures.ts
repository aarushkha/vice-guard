import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'node:path';

export const test = base.extend<{
  extension: { context: BrowserContext; popup: Page };
}>({
  extension: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    const errors: Error[] = [];
    context.on('weberror', (event) => errors.push(event.error()));
    try {
      const manager = await context.newPage();
      await manager.goto('chrome://extensions');
      const id = await manager
        .locator('extensions-item')
        .first()
        .getAttribute('id');
      expect(id).toBeTruthy();
      await manager.close();
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 350, height: 700 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(
        popup.getByRole('checkbox', { name: 'Enable spoiler protection' }),
      ).toBeEnabled();
      await use({ context, popup });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
});

export async function openPage(
  context: BrowserContext,
  html: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.route('http://vice-guard.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html>${html}` }),
  );
  await page.goto('http://vice-guard.test/');
  return page;
}

export { expect };
