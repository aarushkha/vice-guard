export const googleImageSelector =
  '#iur .vCUuC, [data-viewer-group] [data-preview-id], #islrg [data-docid], #islrg .isv-r, [data-docid][data-ri]';

export function imageContext(element: HTMLElement): string {
  const parts = [
    element.closest('[data-viewer-group][data-q]')?.getAttribute('data-q') ??
      '',
  ];
  for (const link of element.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    try {
      const url = new URL(link.href);
      parts.push(
        decodeURIComponent(url.hostname + url.pathname).replace(
          /[/_.-]+/g,
          ' ',
        ),
      );
    } catch {
      // Malformed source links have no usable context.
    }
  }
  return parts.join(' ');
}
