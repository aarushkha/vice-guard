const gridAttribute = 'data-vice-guard-grid';

export const youtubeStyles = `
  ytd-rich-grid-renderer[${gridAttribute}] > #contents {
    display: grid !important;
    grid-auto-flow: row dense !important;
    grid-template-columns: repeat(var(--ytd-rich-grid-items-per-row, 3), minmax(0, 1fr)) !important;
    column-gap: 16px !important;
    row-gap: 32px !important;
  }
  [${gridAttribute}] > #contents > ytd-rich-grid-row,
  [${gridAttribute}] > #contents > ytd-rich-grid-row > #contents {
    display: contents !important;
  }
  [${gridAttribute}] > #contents > ytd-rich-item-renderer,
  [${gridAttribute}] > #contents > ytd-rich-grid-row > #contents > ytd-rich-item-renderer {
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
  }
  [${gridAttribute}] > #contents > :not(ytd-rich-item-renderer):not(ytd-rich-grid-row) {
    grid-column: 1 / -1;
  }
`;

export function createYouTubeLayout(doc: Document) {
  const layouts = new Set<HTMLElement>();
  const cards = new Map<HTMLElement, HTMLElement>();
  const grids = new Map<
    HTMLElement,
    {
      panel: HTMLElement;
      summary: HTMLElement;
      allowReveal: boolean;
    }
  >();

  function refresh(grid: HTMLElement) {
    const state = grids.get(grid);
    if (!state) return;
    const count = [...cards.values()].filter((value) => value === grid).length;
    if (count) {
      state.summary.textContent = `${count} hidden video${count === 1 ? '' : 's'}${state.allowReveal ? ' · Click to review' : ' · Reveal disabled'}`;
      return;
    }
    state.panel.remove();
    grids.delete(grid);
  }

  return {
    sync() {
      for (const grid of doc.querySelectorAll<HTMLElement>(
        'ytd-rich-grid-renderer',
      )) {
        layouts.add(grid);
        grid.setAttribute(gridAttribute, '');
      }
      for (const grid of layouts) if (!grid.isConnected) layouts.delete(grid);
      for (const [grid, state] of grids) {
        if (grid.isConnected && !state.panel.isConnected)
          grid.before(state.panel);
      }
    },
    reset() {
      for (const grid of layouts) grid.removeAttribute(gridAttribute);
      layouts.clear();
    },
    place(
      element: HTMLElement,
      host: HTMLElement,
      allowReveal = true,
    ): boolean {
      if (
        !element.matches('ytd-rich-item-renderer') ||
        element.closest('ytd-rich-section-renderer')
      )
        return false;
      const grid = element.closest<HTMLElement>('ytd-rich-grid-renderer');
      if (!grid) return false;
      let state = grids.get(grid);
      if (!state) {
        const panel = doc.createElement('div');
        panel.dataset.viceGuardUi = '';
        const shadow = panel.attachShadow({ mode: 'closed' });
        shadow.innerHTML = `
          <style>
            :host { display: block; margin: 12px 0; color: inherit; font: 14px Arial, sans-serif; }
            summary { cursor: pointer; padding: 10px 0; }
            section { max-height: 240px; overflow: auto; }
          </style>
          ${
            allowReveal
              ? '<details><summary></summary><section><slot></slot></section></details>'
              : '<div role="status"></div><section hidden><slot></slot></section>'
          }
        `;
        const summary = shadow.querySelector<HTMLElement>(
          'summary, [role="status"]',
        )!;
        grid.before(panel);
        state = { panel, summary, allowReveal };
        grids.set(grid, state);
        grid.setAttribute(gridAttribute, '');
        layouts.add(grid);
      }
      state.panel.append(host);
      cards.set(element, grid);
      refresh(grid);
      return true;
    },
    remove(element: HTMLElement) {
      const grid = cards.get(element);
      cards.delete(element);
      if (grid) refresh(grid);
    },
  };
}
