import { collapseWrappers, type SiteModule } from './types';
import { channelSource, pageChannel, videoImages } from './youtube';

// m.youtube.com renders ytm-* elements, captured from live markup with a
// Pixel 7 profile: search results, related videos and Home are
// ytm-video-with-context-renderer lists, Shorts are lockup view models.
const videoCards = [
  'ytm-video-with-context-renderer',
  'ytm-compact-video-renderer',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytm-reel-item-renderer',
  'ytm-playlist-renderer',
  'ytm-compact-playlist-renderer',
  'ytm-radio-renderer',
  'ytm-compact-radio-renderer',
  'ytm-compact-channel-renderer',
  'yt-lockup-view-model',
];
const comments = [
  'ytm-comment-thread-renderer',
  'ytm-comment-renderer',
  'ytm-comment-view-model',
];
const otherCards = [
  ...comments,
  'ytm-backstage-post-thread-renderer',
  'ytm-post-renderer',
  // Search box suggestions.
  '.ytSearchboxComponentSuggestionsContainer [role="option"]',
];

export const youtubeMobile: SiteModule = {
  id: 'youtube-mobile',
  tier: 1,
  matches: (host) => host === 'm.youtube.com',
  cards: [...videoCards, ...otherCards].join(','),
  extraText(card) {
    // Titles carry the channel, views and age in their labels.
    return [
      ...card.querySelectorAll('h3[aria-label], [role="text"][aria-label]'),
    ]
      .map((element) => element.getAttribute('aria-label'))
      .join(' ');
  },
  images(card) {
    return card.matches(comments.join(',')) ? [] : videoImages(card);
  },
  source(card) {
    if (card.matches(comments.join(','))) return channelSource(card);
    return channelSource(card) ?? pageChannel(location);
  },
  expectsCards: (location) =>
    /^\/($|results|watch|feed\/|shorts\/|@|channel\/|c\/)/.test(
      location.pathname,
    ),
  hideTarget(card) {
    // Home wraps each card in a rich item; removing it closes the gap.
    return (
      card.closest<HTMLElement>('ytm-rich-item-renderer') ??
      collapseWrappers(
        card,
        'body, ytm-item-section-renderer, ytm-section-list-renderer, ytm-rich-grid-renderer',
      )
    );
  },
};
