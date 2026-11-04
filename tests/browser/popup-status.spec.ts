import { expect, test } from './fixtures';

// The popup says where the image check runs, and the engine comes back if
// Chrome closes the offscreen document (it is checked, not assumed).
test('popup shows the image engine status, and the engine recovers', async ({
  extension: { popup, background },
}) => {
  test.setTimeout(180_000);
  const engine = popup.getByTestId('engine');
  await expect(engine).toContainText(
    /Text reader: ready · Image check: ready on (GPU|CPU)/,
    { timeout: 90_000 },
  );
  await background.evaluate(() =>
    (globalThis as any).chrome.offscreen.closeDocument(),
  );
  await expect(engine).toContainText('loading', { timeout: 10_000 });
  await expect(engine).toContainText(
    /Text reader: ready · Image check: ready on (GPU|CPU)/,
    { timeout: 90_000 },
  );
  // Thumbnails are analysed again after the restart.
  const result = await popup.evaluate(() =>
    (globalThis as any).chrome.runtime.sendMessage({
      type: 'vg:image',
      url: `https://img.test/GTA-${Date.now()}.png`,
    }),
  );
  expect(result.error).toBeUndefined();
});
