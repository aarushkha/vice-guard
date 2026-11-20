# Vice Guard on Android

Chrome for Android does not run extensions, so Android gets three things:

|                                                                 | What it is                                                                                                                                                         | Use it for                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **A. Patched YouTube with the Vice Guard filter** (recommended) | YouTube patched with [Morphe](https://github.com/MorpheApp/morphe-patches) plus our "Vice Guard spoiler filter" patch: the extension's own matcher, ported to Java | The YouTube app                                                                              |
| A1. Stock Morphe + keyword list (fallback)                      | Official Morphe, with Vice Guard's rules imported into its "Keyword filter"                                                                                        | Only if you cannot build the patch                                                           |
| **B. Vice Guard Lite**                                          | A text-only build of the extension (537 KB)                                                                                                                        | m.youtube.com, Reddit, X, Google and news in an Android browser that loads Chrome extensions |

Use A for the app and B for the browser. A1 is not foolproof (see its section).

## A. Patched YouTube with the Vice Guard filter

**What it does.** Videos, Shorts and comments about GTA 6 are removed before
they are drawn in Home, Subscriptions, search results, related videos under
the player and Shorts shelves. It uses the extension's matcher (names and
places of the game, look-alike letters, "GTA 5 / Red Dead / Toronto are not
GTA 6", and so on), checked against the TypeScript on 5,541 inputs
(49,879 of 49,879 checks agree). It reads every text of a card, so a YouTube
layout change does not let cards through. If it ever fails, it hides
anything that mentions "gta" rather than showing it.

Searching any GTA 6 term ("gta 6", "leonida", "jason lucia", "vice city 2026")
shows no results: the search text is part of every result, by design.

**Tested with:** YouTube **21.30.216** (the newest version Morphe 2.3.0
supports that is not marked experimental), Morphe patches 2.3.0 plus the
`vice-guard` branch, MicroG RE 7.3.1, on an Android 14 emulator (x86_64).
Not yet tested on a physical phone.

### What you need (one time)

- On the PC: this repo, the Morphe fork (`E:\cloudgta\morphe-patches`,
  branch `vice-guard`), Java 17 or newer, Node.
- A GitHub login with the `read:packages` scope (Morphe's build downloads its
  libraries from GitHub Packages):
  `gh auth refresh -h github.com -s read:packages`.
- The YouTube APK of a supported version. Download the bundle from APKMirror
  yourself (an `.apkm` works). Check it is genuine: its signing certificate
  must be `5aad2bee…0cb6` or `3d7a1223…994a`
  (`apksigner verify --print-certs base.apk`).
- [MicroG RE](https://github.com/MorpheApp/MicroG-RE/releases), needed for
  signing in.
- [Morphe Desktop](https://github.com/MorpheApp/morphe-desktop/releases) (the
  `-all.jar`), which patches on the PC.
- A signing keystore that you keep forever. Every update must be signed with
  the same key, or Android refuses to install it over the old one and you lose
  your settings. Never commit it.

### Build and install

```bash
# 1. In vice-guard: regenerate the Java lexicon and golden vectors (after any lexicon change)
npm run export:java -- ../morphe-patches
```

```bash
# 2. In morphe-patches: build the patches and run the parity tests
./gradlew :patches:buildAndroid :extensions:youtube:testDebugUnitTest --tests "app.morphe.extension.youtube.patches.viceguard.*"
```

The tests must report `Vice Guard parity: N/N checks … agree`. The patches
file is `patches/build/libs/patches-<version>.mpp`.

```bash
# 3. Patch (arm64-v8a for a phone; x86_64 for the emulator)
java -jar morphe-desktop-2.2.0-all.jar patch -p patches-2.3.0.mpp --keystore=vice-guard.keystore --keystore-entry-alias=Morphe --keystore-password=<password> --keystore-entry-password=<password> --striplibs=arm64-v8a -o youtube-viceguard.apk youtube-21.30.216.apkm
```

Check the output says `Applied: Vice Guard spoiler filter`. In
`E:\cloudgta\tools`, `patch.sh` wraps this command with the local keystore.

4. On the phone, install MicroG RE first, then the patched app (or with USB
   debugging: `adb install microg-7.3.1.apk`, then
   `adb install -r youtube-viceguard.apk`). Open it, allow MicroG to run in the
   background when asked, and sign in.
5. Open **Settings → Morphe → Feed → Vice Guard spoiler filter**. "Hide GTA 6
   content" and "Hide GTA 6 comments" are on by default. Tap **Test the
   filter**: it must say _Passed: 1277 of 1277_.

### Keep it that way

- The patched app is a separate app (`app.morphe.android.youtube`, "YouTube
  Morphe"). The Play Store cannot update it, so it never silently loses the
  patch. The Play Store keeps updating the stock YouTube app instead.
- So you never open the stock app by accident: **Settings → Apps → YouTube →
  Disable** (or Uninstall updates, then Disable). Then in the patched app turn
  on **Settings → Morphe → Miscellaneous → App link handling**, so YouTube
  links open in it.
- The Shorts _player_ (swiping in the Shorts tab) is not filtered, because
  each Short starts playing on its own. Shorts in feeds and search are
  filtered. Hide the tab: **Settings → Morphe**, search "Shorts button", turn
  on **Hide Shorts button**.

### Update (new YouTube version or a new Morphe release)

1. In `morphe-patches`: `git fetch origin --tags`, then
   `git rebase <new release tag>` on the `vice-guard` branch. Our changes are
   two commits, almost all in files of their own; the shared files only gain
   two settings in `Settings.java` and a block at the end of `strings.xml`.
2. Check `patches-list.json` for the newest supported YouTube version that is
   not marked experimental, and get that APK.
3. Run steps 1–4 above with the **same keystore**, then
   `adb install -r youtube-viceguard.apk`. Your settings and sign-in stay.

### One-minute check after every update

1. Settings → Morphe → Feed → Vice Guard spoiler filter → **Test the filter**:
   _Passed: N of N_.
2. Search **gta 6**: no results. Search **gta 5**: results.
3. Scroll Home for a minute: nothing about GTA 6.

If step 2 shows GTA 6 results, YouTube moved its cards to a Litho path the
filter does not register. Turn on Settings → Morphe → Miscellaneous →
Debugging → Litho logging, search again, read
`adb logcat | grep LithoFilterPatch` for the card's path, and add it to
`ViceGuardFilter.java`.

### Limits

- Text only: a GTA 6 thumbnail on a video whose title, channel and labels say
  nothing about it still shows. The extension's image recognition is not in
  the app.
- Not filtered: the Shorts player (hide the tab, above), notifications, the
  title and description of a video you open yourself, end screens, and
  search suggestions.

## A1. Fallback: Morphe's keyword filter with Vice Guard's list

For official Morphe without our patch.

```bash
npm run export:morphe
```

This writes `dist/morphe/keywords.txt` (686 keywords), `dropped.txt` (what
was left out and why) and `settings.json`. Import it in the app: Settings →
Morphe → search "import" → **Import / Export → Import from file →
settings.json → Save**. It turns on the four keyword switches (Home,
Subscriptions, search, comments) and fills in the list.

**Morphe's import resets every setting that is not in the file.** If you
changed other Morphe settings, first save them (Import / Export → Export to
file), copy the file to the PC, and merge:

```bash
npm run export:morphe -- --merge Morphe_Settings_2026-11-20.txt
```

**Why it is only a fallback.** Morphe matches literal text, so `npm run
eval:morphe` measures 91.7% recall on YouTube titles, against 100% for Vice
Guard (both with 0 false positives). Worse, Morphe's keyword filter switches
itself off for 60 seconds when it is hiding nearly everything ("Keyword will
hide all videos"). On the emulator, a "gta 6 trailer" search showed that
message, and 9 of the 10 results left on screen were GTA 6 videos. The Vice
Guard patch has no such back-off: the same search showed nothing.

## B. Vice Guard Lite (Android browsers)

```bash
npm run build:lite
```

```bash
npm run zip:lite
```

The output is `.output/chrome-mv3-lite` (537 KB: the text matcher,
`storage` permission only, no OCR, no image model, no offscreen document) and
`.output/vice-guard-chrome-lite.zip`. A signed `.crx` is made with Chromium:
`chrome --pack-extension=.output/chrome-mv3-lite --pack-extension-key=vice-guard-lite.pem`.
Keep the `.pem`: the same key keeps the same extension ID across updates.

It covers YouTube including **m.youtube.com**, Reddit (www, new, old and
mobile web), X / Twitter mobile web, Google and news sites, with the same
pre-hide CSS as the full extension, so cards never flash. Tested with a Pixel 7
profile on mobile markup (`npx playwright test mobile`): 100% recall, 0 false
positives and 0 flashes on all seven pages.

### Which browsers can load it

Not tested on a phone yet: these steps come from the browsers' store pages
and reviews, and menu names change between versions.

| Browser                                                          | Can sideload?                 | How                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Edge** (Canary most reliable; stable reportedly too) | Yes, `.crx`                   | Settings → About → tap the version number until developer options appear → Developer options → **Extension install by crx** → pick `vice-guard-chrome-lite.crx` |
| **Lemur Browser**                                                | Yes, `.crx`, `.zip` or folder | Menu → Extensions → import / **Load unpacked**. Unzipping and loading the folder is reported to be the most reliable                                            |
| **Quetta**                                                       | Reportedly `.crx` / `.zip`    | Menu → Extensions → install from file. Otherwise Chrome Web Store only                                                                                          |
| Kiwi Browser                                                     | —                             | Discontinued in 2025; use Edge or Lemur                                                                                                                         |
| Chrome (Android)                                                 | No                            | No extensions on Android                                                                                                                                        |
| Firefox (Android)                                                | Not this package              | Firefox installs add-ons from addons.mozilla.org; this is a Chrome package                                                                                      |

On desktop Chrome, load it from chrome://extensions → Developer mode → **Load
unpacked** → `.output/chrome-mv3-lite`.

Lite cannot read thumbnails: a GTA 6 thumbnail with an innocent title shows.
On desktop, the full extension can read them.
