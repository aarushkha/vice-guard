// Saves live mobile markup to learn the card structure of mobile sites
// (no extension loaded): npx jiti scripts/capture-mobile.ts <url> <out.html>
import { chromium, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'en-US',
});
const page = await context.newPage();
await page.goto(url!, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(Number(process.env.WAIT ?? 6000));
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(1500);
}
writeFileSync(out!, await page.content());
const tags = await page.evaluate(() => {
  const counts: Record<string, number> = {};
  for (const el of document.querySelectorAll('*'))
    if (/^(ytm|yt)-/.test(el.localName) || el.localName.startsWith('shreddit'))
      counts[el.localName] = (counts[el.localName] ?? 0) + 1;
  return counts;
});
console.log(JSON.stringify(tags, null, 1));
await browser.close();
