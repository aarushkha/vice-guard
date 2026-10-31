import { imagesIn, type SiteModule } from './types';

/** Tier 2: article cards and headings on any other site. Best-effort. */
export const generic: SiteModule = {
  id: 'generic',
  tier: 2,
  matches: () => true,
  cards: [
    'article',
    '[role="article"]',
    '[itemprop="headline"]',
    'h1',
    'h2',
    'h3',
    '.post',
    '.comment',
  ].join(','),
  // Headings in a list of story cards take the whole card with them.
  card: (element) =>
    element.matches('h1, h2, h3, [itemprop="headline"]')
      ? (element.closest<HTMLElement>('article, [role="article"], li') ?? element)
      : element,
  includeNested: true,
  images: (card) => (card.matches('h1, h2, h3') ? [] : imagesIn(card, 'img', 1)),
};
