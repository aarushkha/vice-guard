import { openFixture, test } from './fixtures';
test('probe', async ({ extension: { context, background } }) => {
  test.setTimeout(120000);
  const state = (p: any) => p.evaluate(() => [...document.querySelectorAll('article')].map((a) => a.textContent + ':' + [...a.attributes].map((x) => x.name).join(',')));
  const page = await openFixture(context, 'https://blog.example.test/', `<article><h2>hello</h2><img src="https://img.test/GTA.png"></article><article><h2>bye</h2><img src="https://img.test/plain.png"></article>`);
  for (const ms of [500, 1000, 2000, 5000, 10000, 20000]) { await page.waitForTimeout(ms - (ms > 500 ? [500,1000,2000,5000,10000][[1000,2000,5000,10000,20000].indexOf(ms)] : 0)); console.log(ms, JSON.stringify(await state(page))); }
  console.log(JSON.stringify(await background.evaluate(() => chrome.storage.local.get(['audit', 'imageCache']))).slice(0, 1200));
  const page2 = await openFixture(context, 'https://blog2.example.test/', `<article><h2>again</h2><img src="https://img.test/GTA2.png"></article><article><h2>bye2</h2><img src="https://img.test/plain2.png"></article>`);
  for (const ms of [300, 600, 1000, 1500, 3000]) { await page2.waitForTimeout(300); console.log('warm', ms, JSON.stringify(await state(page2))); }
});
