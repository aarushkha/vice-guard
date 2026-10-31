import { classify, type Verdict } from '../match/matcher';
import type { Settings } from '../settings';
import type { SiteModule, Source } from '../sites';
import { collapseWrappers } from '../sites/types';
import { HIT, OK, WAIT } from './style';
import { readText } from './text';

export interface ImageResult {
  /** Text recognised in the image. */
  ocr?: string;
  /** CLIP probability that the image shows GTA 6. */
  clip?: number;
  error?: string;
  /** Milliseconds spent per stage in the offscreen document (diagnostics). */
  timing?: { fetch: number; ocr: number; clip: number; total: number };
}

export interface HiddenEntry {
  title: string;
  site: string;
  rule: string;
  layer: string;
  url?: string;
}

export interface EngineDeps {
  /** Classifies one image locally; omitted when the image layer is unavailable. */
  image?: (url: string) => Promise<ImageResult>;
  /** Moves pending image requests for on-screen cards to the front of the queue. */
  prioritize?: (urls: string[]) => void;
  isBlocked(source: Source): boolean;
  onHidden(entry: HiddenEntry): void;
  onCount(count: number): void;
  onSourceSeen?(source: Source, title: string, hit: boolean): void;
  onHealth?(broken: boolean): void;
}

/**
 * A card waiting for its image verdict keeps its slot but is invisible, like
 * a loading placeholder. If it sits on screen this long without a verdict it
 * is removed anyway (fail closed); a late clean verdict restores it. The
 * clock starts when the card becomes visible, not when its thumbnail is
 * prefetched. Collapsing sooner would make the feed jump twice for every
 * clean card that is merely slow, so this only guards against a stuck engine.
 */
export const IMAGE_TIMEOUT_MS = 10_000;
const ATTRIBUTES = [
  'title',
  'aria-label',
  'alt',
  'src',
  'href',
  'data-q',
  'post-title',
  'poster',
];

type Status = 'ok' | 'hit' | 'image';
interface CardState {
  signature: string;
  status: Status;
  target?: HTMLElement;
  /** Hidden by the image timeout; a late clean verdict restores it. */
  timedOut?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  requested?: boolean;
  urls: string[];
  title: string;
  shell?: boolean;
}

export function startEngine(
  site: SiteModule,
  initial: Settings,
  deps: EngineDeps,
  doc: Document = document,
) {
  let settings = initial;
  let states = new WeakMap<HTMLElement, CardState>();
  const hidden = new Set<HTMLElement>();
  const imageRequests = new Map<string, Promise<ImageResult>>();
  let seenOnPage = 0;
  let countTimer: ReturnType<typeof setTimeout> | undefined;

  const reportCount = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => deps.onCount(hidden.size), 100);
  };

  const toCard = (element: HTMLElement): HTMLElement | null =>
    site.card ? site.card(element) : element;

  function ownText(card: HTMLElement) {
    const exclude = site.includeNested ? undefined : site.cards;
    return `${readText(card, exclude)} ${site.extraText?.(card) ?? ''}`;
  }

  /** Elements removed from layout, with how many hidden cards chose them. */
  const targets = new Map<HTMLElement, number>();
  function setTarget(state: CardState, target: HTMLElement | undefined) {
    const old = state.target;
    if (old === target) return;
    if (old) {
      const n = (targets.get(old) ?? 1) - 1;
      if (n > 0) targets.set(old, n);
      else (targets.delete(old), old.removeAttribute(HIT));
    }
    state.target = target;
    if (target)
      (targets.set(target, (targets.get(target) ?? 0) + 1),
        target.setAttribute(HIT, ''));
  }

  function markOk(card: HTMLElement) {
    // A clean card can still be the wrapper a nested hidden card removed.
    if (!targets.has(card)) card.removeAttribute(HIT);
    card.setAttribute(OK, '');
  }

  function hide(
    card: HTMLElement,
    state: CardState,
    verdict: Verdict,
    log = true,
  ) {
    clearTimeout(state.timer);
    visibility.unobserve(card);
    setTarget(state, site.hideTarget?.(card) ?? collapseWrappers(card));
    state.status = 'hit';
    card.removeAttribute(OK);
    card.setAttribute(HIT, '');
    if (hidden.has(card)) return;
    hidden.add(card);
    if (log && !state.shell) {
      reportCount();
      deps.onHidden({
        title: state.title,
        site: site.id,
        rule: verdict.rule ?? 'unknown',
        layer: verdict.layer ?? 'text',
        url: state.urls[0],
      });
    }
    site.onHide?.(card);
    collapseShell(card);
  }

  function restore(card: HTMLElement, state: CardState) {
    visibility.unobserve(card);
    setTarget(state, undefined);
    state.timedOut = false;
    markOk(card);
    state.status = 'ok';
    if (hidden.delete(card) && !state.shell) reportCount();
    const parent = card.parentElement?.closest<HTMLElement>(site.cards);
    const parentState = parent && states.get(parent);
    if (parent && parentState?.shell) {
      parentState.shell = false;
      restore(parent, parentState);
    }
  }

  /** Hides a section whose cards are all hidden and which has only a heading left. */
  function collapseShell(card: HTMLElement) {
    if (site.includeNested) return;
    const parent = card.parentElement?.closest<HTMLElement>(site.cards);
    const state = parent && states.get(parent);
    if (!parent || !state || state.status === 'hit') return;
    const nested = [...parent.querySelectorAll<HTMLElement>(site.cards)].filter(
      (element) => element.parentElement?.closest(site.cards) === parent,
    );
    if (!nested.every((element) => element.hasAttribute(HIT))) return;
    if (ownText(parent).replace(/\s+/g, ' ').trim().length > 60) return;
    state.shell = true;
    hide(parent, state, { hit: true, rule: 'empty-shell' }, false);
  }

  function nestedImages(card: HTMLElement): Set<string> {
    const urls = new Set<string>();
    if (site.includeNested) return urls;
    for (const nested of card.querySelectorAll<HTMLElement>(site.cards))
      for (const url of site.images?.(nested) ?? []) urls.add(url);
    return urls;
  }

  function scan(card: HTMLElement) {
    if (!card.isConnected || card.closest('[data-vice-guard-ui]')) return;
    seenOnPage++;
    const text = ownText(card);
    const nested = nestedImages(card);
    const urls =
      settings.imageLayer && deps.image
        ? (site.images?.(card) ?? []).filter((url) => !nested.has(url))
        : [];
    const signature = `${text}\u0000${urls.join(' ')}`;
    const previous = states.get(card);
    if (previous && previous.signature === signature) return;
    if (previous) clearTimeout(previous.timer);
    const state: CardState = {
      signature,
      status: 'ok',
      urls,
      title: text.replace(/\s+/g, ' ').trim().slice(0, 160),
      target: previous?.target,
    };
    states.set(card, state);
    const wasHidden = hidden.has(card);
    hidden.delete(card);

    const source = site.source?.(card);
    const blocked = source && deps.isBlocked(source);
    const verdict = classify(text, settings, {
      blockedSource: blocked ? source.name : undefined,
    });
    if (source && !blocked && state.title)
      deps.onSourceSeen?.(source, state.title, verdict.hit);
    if (verdict.hit) {
      if (wasHidden) hidden.add(card);
      hide(card, state, verdict, !wasHidden);
      return;
    }
    if (wasHidden) reportCount();
    if (urls.length) {
      // Waits hidden (layout kept) for the image verdict.
      state.status = 'image';
      setTarget(state, undefined);
      if (!targets.has(card)) card.removeAttribute(HIT);
      card.removeAttribute(OK);
      intersection.observe(card);
      return;
    }
    restore(card, state);
  }

  function classifyImage(url: string) {
    let request = imageRequests.get(url);
    if (!request) {
      request = deps.image!(url).catch((error: unknown) => ({
        error: String(error),
      }));
      imageRequests.set(url, request);
    }
    return request;
  }

  function requestImages(card: HTMLElement) {
    const state = states.get(card);
    if (!state || state.status !== 'image' || state.requested) return;
    state.requested = true;
    const signature = state.signature;
    visibility.observe(card);
    void Promise.all(state.urls.map(classifyImage)).then((results) => {
      if (states.get(card) !== state || state.signature !== signature) return;
      clearTimeout(state.timer);
      card.removeAttribute(WAIT);
      visibility.unobserve(card);
      for (const result of results) {
        if (result.error) {
          hide(card, state, {
            hit: true,
            rule: `image-error: ${result.error.slice(0, 120)}`,
            layer: 'image',
          });
          return;
        }
        if (result.ocr) {
          // Thumbnail text is judged together with the card's own text.
          const verdict = classify(`${state.title} | ${result.ocr}`, settings, {
            layer: 'ocr',
          });
          if (verdict.hit) {
            if (state.timedOut) hidden.delete(card);
            hide(
              card,
              state,
              {
                ...verdict,
                rule: `${verdict.rule} "${result.ocr.slice(0, 40)}"`,
              },
              true,
            );
            return;
          }
        }
        if (
          result.clip !== undefined &&
          result.clip >= settings.clipThreshold
        ) {
          if (state.timedOut) hidden.delete(card);
          hide(card, state, {
            hit: true,
            rule: `clip ${result.clip.toFixed(2)}`,
            layer: 'clip',
          });
          return;
        }
      }
      restore(card, state);
    });
  }

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersection.unobserve(entry.target);
        requestImages(entry.target as HTMLElement);
      }
    },
    // Classify images well before they scroll into view.
    { rootMargin: '150% 0px 150% 0px' },
  );

  function startTimeout(card: HTMLElement) {
    const state = states.get(card);
    if (!state || state.status !== 'image' || state.timer !== undefined) return;
    deps.prioritize?.(state.urls);
    state.timer = setTimeout(() => {
      if (states.get(card) !== state || state.status !== 'image') return;
      // Fail closed: no verdict in time means hidden.
      state.timedOut = true;
      card.setAttribute(WAIT, '');
      hide(card, state, { hit: true, rule: 'image-timeout', layer: 'image' });
      state.status = 'image';
    }, IMAGE_TIMEOUT_MS);
  }
  // The fail-closed clock only runs while the blank card is on screen.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        startTimeout(card);
        continue;
      }
      const state = states.get(card);
      if (state?.status === 'image' && !state.timedOut) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }
    }
  });

  const roots = new Set<Node>();
  function process() {
    if (!settings.enabled) {
      roots.clear();
      return;
    }
    const cards = new Set<HTMLElement>();
    const add = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return;
      const card = toCard(element);
      if (card) cards.add(card);
    };
    for (const root of roots) {
      const element = root instanceof Element ? root : root.parentElement;
      if (!element?.isConnected) continue;
      if (element.matches(site.cards)) add(element);
      for (const match of element.querySelectorAll(site.cards)) add(match);
      add(element.parentElement?.closest(site.cards) ?? null);
      if (site.card) add(element);
    }
    roots.clear();
    // Inner cards first, so a section sees its items' verdicts.
    const ordered = [...cards].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1,
    );
    for (const card of ordered) scan(card);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList')
        for (const node of record.addedNodes) roots.add(node);
      roots.add(record.target);
    }
    process();
  });

  function observe() {
    observer.observe(doc, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }

  function rescanAll() {
    for (const card of [...hidden]) {
      const state = states.get(card);
      if (state) {
        state.shell = false;
        restore(card, state);
      }
    }
    for (const element of doc.querySelectorAll(
      `[${HIT}], [${OK}], [${WAIT}]`,
    )) {
      element.removeAttribute(HIT);
      element.removeAttribute(OK);
      element.removeAttribute(WAIT);
    }
    hidden.clear();
    targets.clear();
    states = new WeakMap();
    imageRequests.clear();
    reportCount();
    if (settings.enabled) {
      roots.add(doc.documentElement);
      process();
    }
  }

  // Broken-selector check: a page with plenty of content but no cards found.
  let lastUrl = doc.location?.href;
  let broken = false;
  let checks = 0;
  const health = setInterval(() => {
    if (doc.location.href !== lastUrl) {
      lastUrl = doc.location.href;
      seenOnPage = doc.querySelectorAll(site.cards).length;
      checks = 0;
    }
    checks++;
    if (site.tier !== 1 || !site.expectsCards || checks < 3) return;
    const now =
      settings.enabled &&
      seenOnPage === 0 &&
      site.expectsCards(doc.location) &&
      doc.querySelectorAll(site.cards).length === 0 &&
      (doc.body?.innerText.length ?? 0) > 2000;
    if (now !== broken) {
      broken = now;
      deps.onHealth?.(broken);
    }
  }, 2000);

  const stopSite = site.start?.(doc, (card) => hidden.has(card)) ?? (() => {});
  observe();
  roots.add(doc.documentElement);
  process();

  return {
    update(next: Settings) {
      settings = next;
      rescanAll();
    },
    /** Rescans everything, e.g. after the channel blocklist changes. */
    rescan: rescanAll,
    stats: () => ({ hidden: hidden.size }),
    stop() {
      observer.disconnect();
      intersection.disconnect();
      visibility.disconnect();
      clearInterval(health);
      clearTimeout(countTimer);
      stopSite();
      settings = { ...settings, enabled: false };
      rescanAll();
    },
  };
}
