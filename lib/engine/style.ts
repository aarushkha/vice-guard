import type { SiteModule } from '../sites';

export const OK = 'data-vg-ok';
export const HIT = 'data-vg-hit';

/**
 * Candidates stay visibility:hidden (keeping their layout box) until scanned
 * clean; matches are removed from layout entirely.
 */
export function engineCss(site: SiteModule): string {
  const rules = [`[${HIT}] { display: none !important; }`];
  if (site.prehideCards !== false)
    rules.push(
      `:is(${site.cards}):not([${OK}]):not([${HIT}]) { visibility: hidden !important; }`,
    );
  if (site.pendingLeaves)
    rules.push(
      `:is(${site.pendingLeaves}):not([${OK}] *) { visibility: hidden !important; }`,
    );
  return rules.join('\n') + (site.css ?? '');
}

/** Injected synchronously at document_start, before the page has a <head>. */
export function injectStyle(doc: Document, css: string): HTMLStyleElement {
  const style = doc.createElement('style');
  style.dataset.viceGuardUi = '';
  style.textContent = css;
  (doc.head ?? doc.documentElement).append(style);
  return style;
}
