export const shortsSelector = 'ytd-reel-video-renderer';
const attribute = 'data-vice-guard-short';

export const shortsStyles = `
  [${attribute}] { position: relative !important; }
  [${attribute}] > :not([data-vice-guard-ui]),
  [${attribute}] > :not([data-vice-guard-ui]) * {
    visibility: hidden !important;
    pointer-events: none !important;
  }
`;

export function createShortsProtection(doc: Document) {
  function preventPlayback(event: Event) {
    const video = event.target;
    if (video instanceof HTMLVideoElement && video.closest(`[${attribute}]`))
      video.pause();
  }
  doc.addEventListener('play', preventPlayback, true);

  return {
    place(element: HTMLElement, host: HTMLElement): boolean {
      if (!element.matches(shortsSelector)) return false;
      element.setAttribute(attribute, '');
      Object.assign(host.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '100',
        margin: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        padding: '24px',
      });
      element.append(host);
      for (const video of element.querySelectorAll('video')) video.pause();
      return true;
    },
    remove(element: HTMLElement) {
      element.removeAttribute(attribute);
    },
    stop() {
      doc.removeEventListener('play', preventPlayback, true);
    },
  };
}
