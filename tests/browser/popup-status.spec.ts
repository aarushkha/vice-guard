import { expect, test } from './fixtures';

// The popup says where the image check runs, even after the background
// worker restarted (it asks the offscreen document, not its own memory).
test('popup shows the image engine status', async ({ extension: { popup } }) => {
  test.setTimeout(120_000);
  await expect(popup.getByTestId('engine')).toContainText(
    /Text reader: ready · Image check: ready on (GPU|CPU)/,
    { timeout: 90_000 },
  );
});
