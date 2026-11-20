# Hand-off prompt: Vice Guard on Android (patched YouTube + lite extension)

Paste everything below the line into a coding agent running **locally** on the
Windows machine that holds the repo (`E:\cloudgta\vice-guard`). It needs Node,
Git, Java 17+, Android platform-tools (adb) and, for part B, Android Studio's
SDK (Gradle downloads the rest). A real Android phone over USB, or an Android
emulator with Google APIs, is needed to verify part A.

---

You are working in the Vice Guard repository (`E:\cloudgta\vice-guard`, branch
`high-recall-nrdzuv`; pull it first). Vice Guard is a Chrome MV3 extension (WXT,
TypeScript) that hides GTA 6 spoilers on YouTube, Reddit, X, Google and news
sites. Its core is a text matcher in `lib/match/` (`matcher.ts`: `classify`,
`canonicalTokens`, `contextRule`, `namesOtherGame`; `lexicon.ts`: phrase lists;
`normalize.ts`, `stem.ts`), site adapters in `lib/sites/`, a seeded channel
blocklist in `lib/channels.ts`, and an image layer (Tesseract OCR + MobileCLIP)
in an offscreen document. Tests: `npm test` (vitest, 52 unit tests),
`npx playwright test` (browser fixtures in `tests/browser/`), `npm run eval`
(text/OCR eval over `tests/eval/dataset.json` and a handwritten holdout). The
user's goals, in their words: maximum recall ("idc if something gets false
blocked", within reason), blocking that is invisible, and for this task, "as
foolproof as possible".

Chrome for Android does not run extensions, so Android gets two things:

## Part A — patched YouTube app (priority)

Use **Morphe** (https://github.com/MorpheApp/morphe-patches, actively
maintained; v2.3.0 released 2026-11-16). ReVanced is the predecessor: its
GitHub repo was DMCA'd, it lives at https://gitlab.com/ReVanced/revanced-patches
and has had no commits since 2026-05-31. Do not build on ReVanced.

Facts already checked in Morphe's source (re-check them, they move):

- `extensions/youtube/src/main/java/app/morphe/extension/youtube/patches/components/KeywordContentFilter.java`
  hides Home, Subscriptions and Search results (and optionally comments) whose
  title, channel line or comment text contains a keyword. It runs inside the
  app's Litho component filter, i.e. **before the item is drawn** (invisible).
- Keyword rules: one per line; any casing; minimum 3 characters; a keyword in
  double quotes matches whole words only; a keyword starting with `@` also
  matches channel handles. Plurals need separate entries with whole-word
  syntax. Limits: Shorts in Home/Subscriptions do not show the channel name;
  some residue (chapter previews) can remain.
- Settings keys: `morphe_hide_keyword_content_home`, `_search`,
  `_subscriptions`, `_comments` (booleans, default off) and
  `morphe_hide_keyword_content_phrases` (newline-separated string).
- It ships in the "Hide layout components" patch. `patches-list.json` lists
  supported YouTube versions (21.45.82 was the newest, marked experimental;
  use the newest **non-experimental** version listed).

### A1. Export Vice Guard's rules as a Morphe keyword list (do this first)

Write `scripts/export-morphe.ts` (`npm run export:morphe`) that generates
`dist/morphe/keywords.txt` from the real matcher data, not a hand-copied list:

- every explicit GTA 6 phrase (gta 6, gta vi, gta6, gtavi, grand theft auto vi
  and their spacing/punctuation variants), the unique names and places
  (Leonida, Jason Duval, Lucia Caminos, Port Gellhorn, Ambrosia, Grassrivers,
  Mount Kalaga, Vice City 2026 …), and the strong spoiler phrases, taken from
  `lib/match/lexicon.ts`;
- channel handles from `lib/channels.ts` as `@handle` lines;
- whole-word quotes on anything short or ambiguous (e.g. `"gta 6"`, `"vi"`
  must never appear alone), plural/possessive variants where needed;
- drop anything under 3 characters and any entry that only makes sense with
  Vice Guard's context rules (e.g. bare "Lucia", "Jason", "Vice City",
  "Rockstar" would block unrelated videos). Write the dropped entries and the
  reason to `dist/morphe/dropped.txt`.

Measure it: add a mode to the eval (`tests/eval/run.ts`, or a new
`tests/eval/morphe.ts`) that applies the exported list with Morphe's exact
matching rules (port `KeywordContentFilter`'s matching logic faithfully: case
folding, whole-word handling, @handles) to the YouTube rows of
`tests/eval/dataset.json` and the holdout, and reports recall and false
positives next to Vice Guard's own matcher. Iterate on the list until
false positives on the negatives are ~0 and recall is as close as possible.
Commit the script and the eval, not the generated files.

Also produce `dist/morphe/settings.json`: the same keywords plus the four
switches on, in the format Morphe's settings **import** accepts (find the
import/export code in the Morphe extension sources and match it exactly), so
the user imports one file instead of pasting text. Verify by importing it on
the device.

### A2. A real Vice Guard filter inside the app (the foolproof version)

A keyword list cannot express Vice Guard's context rules (e.g. "Lucia" only
counts near GTA words, negation of Rockstar, "GTA 5" is not GTA 6). Fork
morphe-patches and add a patch, e.g. "Vice Guard spoiler filter":

- Java extension class next to `KeywordContentFilter`, built on the same
  filter base (`BufferPhraseFilter` / the Litho filter registration it uses),
  so items are dropped before drawing in Home, Subscriptions, Search, the
  related videos under the player, Shorts shelves and, optionally, comments
  and notifications.
- Port the matcher to Java: `canonicalTokens`, `contextRule`, `classify`
  (strict mode), `namesOtherGame`, plus the lexicon. Keep a single source of
  truth: generate the Java lexicon from `lib/match/lexicon.ts` with a script
  in the Vice Guard repo, never by hand.
- **Parity tests:** export golden vectors (input text → expected verdict)
  from the TypeScript matcher over `tests/eval/dataset.json`, the holdout and
  the unit-test cases; a JUnit test in the patch repo must agree on 100% of
  them. This is what makes the port trustworthy.
- Channel blocklist: hide items whose channel name or handle is in the seeded
  list.
- Failure handling: an exception in the filter must never crash YouTube. Catch,
  log once, and fall back to hiding items whose text contains "gta" (fail
  closed, but never block the whole feed).
- Settings: on by default, a toggle and a "test the filter" entry in the
  patch's settings screen that runs the golden vectors on the device and
  shows pass/fail.

Build and verify:

- `./gradlew build` in the fork; patch with Morphe CLI (or Morphe Manager with
  the fork as a custom patch source) against the newest non-experimental
  YouTube version the patches support. The user supplies the APK; never
  download APKs from unofficial mirrors.
- Install with GmsCore/MicroG (needed for sign-in), as Morphe documents.
- On the device: search "gta 6", "gta 6 trailer", "jason lucia", "vice city
  2026", "leonida" → no results visible; search "gta 5", "red dead",
  "miami vlog", "vsauce" → results visible. Scroll Home for 2 minutes and
  check nothing GTA 6 related appears. Record the YouTube version tested.
- Foolproofing for the user: write `docs/android.md` with step-by-step
  install, how to stop the Play Store updating the patched app, how to update
  (re-patch with the new Morphe release), and a one-minute check after every
  update.

## Part B — "Vice Guard Lite" browser extension (cheap)

A text-only build of the same extension for mobile-capable Chromium browsers
that load Chrome extensions (Microsoft Edge for Android, Lemur, Quetta;
document which ones work), and for desktop Chrome users who want it light.

- One codebase: add a WXT build target, e.g. `npm run build:lite` →
  `.output/chrome-mv3-lite`, with no offscreen document, no OCR/CLIP, no
  `public/models`, `public/ort` or `public/tesseract` assets, no
  `wasm-unsafe-eval`; the popup hides the image options. Target size under
  1 MB.
- Sites: YouTube **including m.youtube.com** (mobile markup differs:
  `ytm-*` elements, write a site module and fixtures from real m.youtube.com
  markup), Reddit (www, old, new and mobile web), X/Twitter mobile web,
  Google and news. Keep pre-hide CSS so nothing flashes.
- Tests: Playwright fixtures for the mobile pages with a phone viewport
  (`devices['Pixel 7']`), same recall/flash/false-positive checks as
  `tests/browser/sites.spec.ts`.
- Package as a zip/crx the user can sideload, and document the steps per
  browser in `docs/android.md`. If a browser cannot sideload, say so.

## Ground rules

- Work on branch `high-recall-nrdzuv` of Vice Guard; put the Morphe fork in a
  separate directory/repo. Commit in small steps with clear messages; do not
  open pull requests unless asked.
- Never commit APKs, keystores, generated keyword files or downloaded images.
- Report results as numbers: recall and false positives of the exported list
  vs Vice Guard's matcher, parity-test pass rate, the YouTube version tested,
  and what you verified on a real device versus only in tests.
- If something can't be done (an API changed, a browser can't sideload), say
  so plainly and propose the next best option instead of faking it.
