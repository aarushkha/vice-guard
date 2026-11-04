// Adds YouTube thumbnails to tests/eval/clip-training.json for training the
// CLIP classifier: `npx jiti scripts/collect-clip-training.ts`.
//
// Negatives are what a YouTube feed is actually full of: a wide spread of
// topics, with titles checked to be unrelated to GTA. Positives are GTA 6
// videos whose titles say so. Only video ids and titles are stored.
import { readFileSync, writeFileSync } from 'node:fs';

interface Entry {
  query: string;
  id: string;
  title?: string;
}
interface Training {
  about: string;
  positive: { art: string[]; youtube: Entry[] };
  negative: { youtube: Entry[] };
}

const file = 'tests/eval/clip-training.json';
const training = JSON.parse(readFileSync(file, 'utf8')) as Training;

const negativeQueries = [
  // Science, education, explainers
  'vsauce',
  'veritasium',
  'kurzgesagt',
  'vox explained',
  'geography now',
  'techquickie',
  'physics explained',
  'history documentary',
  'space documentary',
  'math puzzle',
  'chemistry experiment',
  'engineering explained',
  'ted talk',
  'psychology explained',
  'economics explained',
  'language learning',
  'why is the sky blue',
  'how its made',
  'ancient egypt',
  'world war 2 history',
  // Food, travel, lifestyle
  'food challenge',
  'beardmeatsfood',
  'street food',
  'mukbang',
  'cooking recipe',
  'baking cake',
  'restaurant review',
  'travel vlog japan',
  'travel vlog italy',
  'day in my life',
  'weekend vlog',
  'apartment tour',
  'morning routine',
  'gym workout',
  'yoga for beginners',
  'skincare routine',
  'fashion haul',
  'tiny house tour',
  'camping vlog',
  'hiking mountains',
  'beach vacation',
  'miami vlog',
  'florida travel',
  'new york city walk',
  'london vlog',
  // Entertainment, film, TV
  'movie trailer',
  'official teaser trailer',
  'bollywood movie',
  'bollywood songs',
  'tollywood trailer',
  'k drama',
  'anime opening',
  'netflix series trailer',
  'movie review',
  'film analysis',
  'oscars moment',
  'late night show',
  'snl sketch',
  'stand up comedy',
  'sitcom clips',
  'cartoon clips',
  'bobs burgers',
  'simpsons clip',
  'family guy clip',
  'reality tv',
  'interview celebrity',
  'red carpet',
  'podcast clip',
  'joe rogan',
  // Music
  'music video',
  'live performance snl',
  'kendrick lamar',
  'taylor swift',
  'hip hop music video',
  'kpop music video',
  'lofi hip hop',
  'guitar cover',
  'piano tutorial',
  'concert live',
  'indian song',
  'rap freestyle',
  'edm festival',
  'classical music',
  'drum cover',
  'acoustic cover',
  // Comedy, memes, internet culture
  'memes compilation',
  'jojo memes',
  'funny moments',
  'prank video',
  'all gas no brakes',
  'man on the street interview',
  'reaction video',
  'try not to laugh',
  'skit comedy',
  'roast',
  'the ben and emil show',
  'internet culture explained',
  'shitpost compilation',
  // Tech, cars, DIY
  'tech review',
  'iphone review',
  'pc build',
  'graphics card benchmark',
  'rtx 5070 benchmark',
  'unboxing',
  'car review',
  'supercar',
  'car crash test',
  'diy home improvement',
  'woodworking',
  'backyard scientist',
  'electricity experiment',
  'restoration video',
  'drone footage',
  'camera review',
  'smartphone camera test',
  // News, politics, business
  'news today',
  'election explained',
  'politics debate',
  'stock market news',
  'business documentary',
  'startup story',
  'real estate',
  'crypto news',
  'court case',
  'true crime',
  'documentary full',
  'interview politician',
  // Sports
  'football highlights',
  'nba highlights',
  'cricket highlights',
  'f1 highlights',
  'ufc highlights',
  'tennis highlights',
  'boxing',
  'skateboarding',
  'surfing',
  'golf highlights',
  'baseball highlights',
  'wrestling',
  // Kids, animals, nature
  'cute animals',
  'cat videos',
  'dog training',
  'wildlife documentary',
  'nature documentary',
  'ocean documentary',
  'kids songs',
  'minecraft',
  // Other games (look closest to GTA)
  'call of duty campaign',
  'fortnite',
  'roblox',
  'elden ring',
  'cyberpunk 2077',
  'red dead redemption 2',
  'watch dogs',
  'saints row',
  'mafia game',
  'need for speed',
  'forza horizon',
  'the crew motorfest',
  'spider-man game',
  'assassins creed',
  'far cry',
  'sleeping dogs',
  'hitman',
  'just cause',
  'driver san francisco',
  'cities skylines',
  'sims 4',
  'valorant',
  'league of legends',
  'counter strike',
  'apex legends',
  'pokemon',
  'zelda',
  'mario',
  'resident evil',
  'the last of us',
  'god of war',
  'horror game',
  'indie game',
  'speedrun',
  'game review',
  'game trailer',
];
const positiveQueries = [
  'gta 6',
  'gta 6 trailer',
  'gta 6 trailer 2',
  'gta 6 trailer 3',
  'gta 6 leaks',
  'gta 6 gameplay',
  'gta 6 map',
  'gta 6 lucia',
  'gta 6 jason',
  'gta 6 vice city',
  'gta 6 leonida',
  'gta 6 news',
  'gta 6 release date',
  'gta 6 analysis',
  'gta 6 breakdown',
  'gta 6 characters',
  'gta 6 cars',
  'gta 6 story',
  'gta 6 ending',
  'gta 6 missions',
  'gta vi',
  'grand theft auto vi',
  'gta 6 reaction',
  'gta 6 theory',
  'gta 6 screenshots',
  'gta 6 details',
  'gta 6 graphics',
  'gta 6 everything we know',
  'gta 6 port gellhorn',
  'gta 6 mount kalaga',
  'gta 6 grassrivers',
  'gta 6 ambrosia',
  'gta 6 keys',
];

const gtaTitle =
  /\bgta\b|grand theft|rockstar|vice city|leonida|\blucia\b|jason duval|gta[ -]?(5|6|v|vi)\b/i;
const gta6Title =
  /gta[ -]?(6|vi)\b|grand theft auto (6|vi)\b|leonida|vice city 2026/i;

async function search(query: string): Promise<{ id: string; title: string }[]> {
  // The consent cookie skips the cookie banner redirect.
  const response = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`,
    {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'accept-language': 'en',
        cookie: 'SOCS=CAI; CONSENT=YES+1',
      },
    },
  ).catch(() => undefined);
  if (!response?.ok) return [];
  const html = await response.text();
  const results: { id: string; title: string }[] = [];
  const pattern =
    /"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  for (const match of html.matchAll(pattern))
    results.push({ id: match[1]!, title: JSON.parse(`"${match[2]}"`) });
  return results;
}

const seen = new Set([
  ...training.positive.youtube.map((e) => e.id),
  ...training.negative.youtube.map((e) => e.id),
]);
let added = 0;
// Queries already used are searched again: ids already stored are skipped.
const jobs = [
  ...negativeQueries.map((query) => ({ query, positive: false })),
  ...positiveQueries.map((query) => ({ query, positive: true })),
];
for (let i = 0; i < jobs.length; i += 3)
  await Promise.all(
    jobs.slice(i, i + 3).map(async ({ query, positive }) => {
      for (const { id, title } of await search(query)) {
        if (seen.has(id)) continue;
        if (positive ? !gta6Title.test(title) : gtaTitle.test(title)) continue;
        seen.add(id);
        (positive ? training.positive : training.negative).youtube.push({
          query,
          id,
          title,
        });
        added++;
      }
    }),
  );
writeFileSync(file, `${JSON.stringify(training, null, 2)}\n`);
console.log(
  `Added ${added}: ${training.positive.youtube.length} positive and ${training.negative.youtube.length} negative YouTube thumbnails.`,
);
