// Vice Guard Lite on phone-sized pages: the text-only build with a Pixel 7
// profile (viewport, touch, mobile user agent). Each page reproduces the
// mobile markup of a site, filled with the eval set's text examples (Lite
// reads no thumbnails), and is checked like sites.spec.ts: recall, false
// positives and flashes. The m.youtube.com cards copy markup captured from
// the live site with a Pixel 7 profile.
// Run: npm run build:lite && npx playwright test mobile
import { readFileSync } from 'node:fs';
import {
  expect,
  flashes,
  openFixture,
  outcomes,
  settle,
  streamScript,
  test,
} from './fixtures';

interface Example {
  site: string;
  text: string;
  label: number;
  carrier?: string;
}
const dataset = JSON.parse(
  readFileSync('tests/eval/dataset.json', 'utf8'),
) as Example[];
const holdout = readFileSync('tests/eval/holdout.jsonl', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Example);
const pick = (site: string) => [
  ...dataset.filter((e) => e.site === site && (e.carrier ?? 'text') === 'text'),
  ...holdout.filter((e) => e.site === site),
];

const esc = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const expectAttr = (e: Example) => `data-expect="${e.label ? 'hide' : 'keep'}"`;
const videoId = (i: number) => `m${i.toString(16)}`.padEnd(11, '0');

/** ytm-video-with-context-renderer as m.youtube.com renders it in search, Home and related. */
const mobileVideo = (e: Example, i: number) => {
  const id = videoId(i);
  return `<ytm-video-with-context-renderer class="item adaptive-feed-item" ${expectAttr(e)}><ytm-media-item>
    <a href="/watch?v=${id}" class="media-item-thumbnail-container" aria-hidden="true"><ytm-thumbnail-cover><img alt="" src="https://i.ytimg.com/vi/${id}/hq720.jpg" style="width:100%;aspect-ratio:16/9;display:block"></ytm-thumbnail-cover></a>
    <div class="media-item-details"><div class="media-channel"><ytw-channel-thumbnail-with-link-renderer><a href="/@creator${i}" aria-label="Go to channel Creator ${i}"><ytm-profile-icon><img alt="Go to channel Creator ${i}"></ytm-profile-icon></a></ytw-channel-thumbnail-with-link-renderer></div>
    <div class="media-item-info"><div class="media-item-metadata"><a href="/watch?v=${id}"><h3 class="media-item-headline"><span class="ytAttributedStringHost" aria-label="${esc(e.text)} by Creator ${i} 1,024 views 1 day ago 8 minutes" role="text">${esc(e.text)}</span></h3>
    <div><ytm-badge-and-byline-renderer><span class="ytmBadgeAndBylineRendererItemByline" aria-hidden="true"><span class="ytAttributedStringHost">Creator ${i}</span></span><span aria-hidden="true">•</span><span class="ytmBadgeAndBylineRendererItemByline" aria-hidden="true"><span class="ytAttributedStringHost" aria-label="1 thousand views" role="text">1K views</span></span></ytm-badge-and-byline-renderer></div></a></div>
    <ytm-bottom-sheet-renderer class="media-item-menu"><button aria-label="Action menu"></button></ytm-bottom-sheet-renderer></div></div>
  </ytm-media-item></ytm-video-with-context-renderer>`;
};
/** ytm-shorts-lockup-view-model: the title is drawn over the thumbnail. */
const mobileShort = (e: Example, i: number) => {
  const id = videoId(i);
  return `<ytm-shorts-lockup-view-model class="shortsLockupViewModelHost" ${expectAttr(e)} style="display:block;width:48%;display:inline-block;vertical-align:top">
    <a href="/shorts/${id}" class="shortsLockupViewModelHostEndpoint reel-item-endpoint"><div><yt-thumbnail-view-model><div><img alt="" src="https://i.ytimg.com/vi/${id}/sardefault.jpg" style="width:100%;aspect-ratio:2/3;display:block"></div></yt-thumbnail-view-model></div>
    <div class="shortsLockupViewModelHostInlineMetadata"><h3 class="shortsLockupViewModelHostMetadataTitle" aria-label="${esc(e.text)}, 13 thousand views, Creator ${i}, 7 hours ago - play Short"><span class="ytAttributedStringHost" role="text">${esc(e.text)}</span></h3><div aria-hidden="true">13K views</div></div></a>
    <div class="shortsLockupViewModelHostOutsideMetadata"><avatar-view-model><yt-avatar-shape><div aria-label="Go to channel Creator ${i} " role="button"></div></yt-avatar-shape></avatar-view-model></div>
  </ytm-shorts-lockup-view-model>`;
};

interface MobileFixture {
  name: string;
  url: string;
  examples: Example[];
  card(e: Example, i: number): string;
  page(cards: string): string;
  container: string;
}

const youtube = pick('youtube');
const mobileFixtures: MobileFixture[] = [
  {
    name: 'm.youtube.com search',
    url: 'https://m.youtube.com/results?search_query=games',
    examples: youtube,
    container: 'ytm-item-section-renderer > lazy-list',
    // Every fourth result is a Short, as in mixed search results.
    card: (e, i) => (i % 4 === 3 ? mobileShort(e, i) : mobileVideo(e, i)),
    page: (cards) =>
      `<body style="margin:0"><ytm-app><ytm-search><ytm-section-list-renderer><ytm-item-section-renderer><lazy-list>${cards}</lazy-list></ytm-item-section-renderer></ytm-section-list-renderer></ytm-search></ytm-app></body>`,
  },
  {
    name: 'm.youtube.com Home',
    url: 'https://m.youtube.com/',
    examples: youtube.filter((_, i) => i % 2 === 1),
    container: 'ytm-rich-grid-renderer > div',
    card: (e, i) =>
      `<ytm-rich-item-renderer>${mobileVideo(e, i)}</ytm-rich-item-renderer>`,
    page: (cards) =>
      `<body style="margin:0"><ytm-app><ytm-browse><ytm-rich-grid-renderer><div>${cards}</div></ytm-rich-grid-renderer></ytm-browse></ytm-app></body>`,
  },
  {
    name: 'reddit mobile web',
    url: 'https://www.reddit.com/',
    examples: pick('reddit'),
    container: 'shreddit-feed',
    card: (e, i) =>
      `<article ${expectAttr(e)}><shreddit-post post-title="${esc(e.text)}" subreddit-prefixed-name="r/sub${i}" style="display:block;padding:8px">
        <a href="/r/sub${i}">r/sub${i}</a><a slot="title" href="/r/sub${i}/comments/${i}/x/">${esc(e.text)}</a></shreddit-post></article><hr>`,
    page: (cards) =>
      `<body><shreddit-app><main><shreddit-feed style="display:block">${cards}</shreddit-feed></main></shreddit-app></body>`,
  },
  {
    name: 'old.reddit.com',
    url: 'https://old.reddit.com/',
    examples: pick('reddit').filter((_, i) => i % 2 === 0),
    container: '#siteTable',
    card: (e, i) =>
      `<div class="thing link" data-subreddit="sub${i}" data-subreddit-prefixed="r/sub${i}" ${expectAttr(e)}><div class="entry"><p class="title"><a class="title" href="/r/sub${i}/comments/${i}/x/">${esc(e.text)}</a></p>
        <p class="tagline">submitted by <a class="author">user${i}</a> to <a class="subreddit" href="/r/sub${i}/">r/sub${i}</a></p></div></div>`,
    page: (cards) => `<body><div id="siteTable">${cards}</div></body>`,
  },
  {
    name: 'x.com mobile web',
    url: 'https://x.com/home',
    examples: pick('x'),
    container: '[aria-label="Timeline"] > div',
    card: (e, i) =>
      /^Trending/.test(e.text)
        ? `<div data-testid="cellInnerDiv" ${expectAttr(e)}><div><div data-testid="trend" role="link">${esc(e.text)}</div></div></div>`
        : `<div data-testid="cellInnerDiv" ${expectAttr(e)}><div><article data-testid="tweet" style="padding:8px">
          <div data-testid="User-Name"><a href="/user${i}">User ${i}</a></div>
          <div data-testid="tweetText" lang="en">${esc(e.text)}</div></article></div></div>`,
    page: (cards) =>
      `<body><main><div aria-label="Timeline"><div>${cards}</div></div></main></body>`,
  },
  {
    name: 'google mobile',
    url: 'https://www.google.com/search?q=games',
    examples: pick('google'),
    container: '#rso',
    card: (e, i) =>
      `<div class="MjjYud" ${expectAttr(e)}><div class="g"><a href="https://site${i}.example/page"><h3>${esc(e.text)}</h3></a>
        <div>Result snippet ${i}.</div></div></div>`,
    page: (cards) =>
      `<body><div id="search"><div id="rso">${cards}</div></div></body>`,
  },
  {
    name: 'news article (tier 2)',
    url: 'https://news.example.test/',
    examples: pick('news'),
    container: 'main',
    card: (e) =>
      `<article ${expectAttr(e)}><h2>${esc(e.text)}</h2><p>Continue reading.</p></article>`,
    page: (cards) => `<body><main>${cards}</main></body>`,
  },
];

test.use({ extensionDir: '.output/chrome-mv3-lite', device: 'Pixel 7' });

test('lite: no image engine, no offscreen document, no image options', async ({
  extension: { popup, background },
}) => {
  await expect(
    popup.getByRole('checkbox', { name: 'Scan images' }),
  ).toHaveCount(0);
  const manifest = await background.evaluate(() =>
    (globalThis as any).chrome.runtime.getManifest(),
  );
  expect(manifest.permissions).toEqual(['storage']);
  expect(JSON.stringify(manifest)).not.toContain('wasm-unsafe-eval');
});

for (const fixture of mobileFixtures) {
  test(`mobile: ${fixture.name}`, async ({
    extension: { context, background, requests },
  }) => {
    test.setTimeout(180_000);
    const cards = fixture.examples.map((e, i) => fixture.card(e, i));
    const initial = Math.ceil(cards.length * 0.4);
    const page = await openFixture(
      context,
      fixture.url,
      fixture.page(cards.slice(0, initial).join('')) +
        streamScript(fixture.container, cards.slice(initial)),
    );
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'emulates a touch phone',
    ).toBe(true);
    await settle(page);
    const result = await outcomes(page);
    const seen = [...new Set(await flashes(page))].filter(
      (text) => !result.misses.some((miss) => miss.startsWith(text)),
    );
    console.log(
      `${fixture.name}: recall ${result.tp}/${result.tp + result.fn}, false positives ${result.fp}/${result.fp + result.tn}, flashes ${seen.length}`,
    );
    expect(seen, 'no card that must be hidden is ever painted').toEqual([]);
    expect(
      result.fp,
      `false positives: ${result.falsePositives.join(' / ')}`,
    ).toBe(0);
    expect(
      result.tp / (result.tp + result.fn),
      `misses: ${result.misses.join(' / ')}`,
    ).toBeGreaterThanOrEqual(0.95);
    // Lite never creates the offscreen document nor fetches thumbnails itself.
    const offscreen = await background.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
          })
        ).length,
    );
    expect(offscreen).toBe(0);
    expect(
      requests.filter(
        (url) =>
          url.startsWith('chrome-extension://') &&
          /models|ort|tesseract/.test(url),
      ),
    ).toEqual([]);
  });
}
