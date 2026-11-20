import { generic } from './generic';
import { gnews } from './gnews';
import { google } from './google';
import { reddit } from './reddit';
import type { SiteModule } from './types';
import { x } from './x';
import { youtube } from './youtube';
import { youtubeMobile } from './youtube-mobile';

// m.youtube.com before youtube, which matches every youtube.com host.
export const sites: SiteModule[] = [
  youtubeMobile,
  youtube,
  reddit,
  x,
  google,
  gnews,
];

export function siteFor(hostname: string): SiteModule {
  return sites.find((site) => site.matches(hostname)) ?? generic;
}

export type { SiteModule, SiteId, Source } from './types';
