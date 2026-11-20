import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

function buildStamp() {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // Not a git checkout (e.g. a source zip).
  }
  return `${commit} · built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// `--mode lite` (npm run build:lite) builds Vice Guard Lite: the text matcher
// only, for mobile Chromium browsers and light desktop installs. No offscreen
// document, OCR or CLIP, so no models, wasm or 'wasm-unsafe-eval'.
const modeAt = process.argv.indexOf('--mode');
const lite = modeAt > 0 && process.argv[modeAt + 1] === 'lite';
const imageAssets = /^(models|ort|tesseract)[\\/]/;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  browser: 'chrome',
  filterEntrypoints: lite ? ['background', 'content', 'popup'] : undefined,
  hooks: {
    'build:publicAssets'(_, files) {
      if (!lite) return;
      const kept = files.filter((file) => !imageAssets.test(file.relativeDest));
      files.splice(0, files.length, ...kept);
    },
  },
  zip: {
    artifactTemplate: 'vice-guard-{{browser}}{{modeSuffix}}.zip',
    excludeSources: [
      'test-results/**',
      'playwright-report/**',
      '.browser-cache/**',
      '.model-cache/**',
    ],
  },
  vite: () => ({
    // Shown in the popup footer so it is clear which build Chrome loaded.
    define: {
      __BUILD__: JSON.stringify(buildStamp()),
      __LITE__: JSON.stringify(lite),
    },
    resolve: {
      alias: [
        {
          // onnxruntime's WebGPU build (it also runs on the CPU), with its
          // wasm loaded from public/ort rather than bundled a second time.
          find: /^onnxruntime-web(\/webgpu)?$/,
          replacement: resolve(
            'node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs',
          ),
        },
      ],
    },
    worker: { format: 'es' },
  }),
  manifest: {
    ...(lite
      ? {
          name: 'Vice Guard Lite - GTA 6 Spoiler Blocker',
          description:
            'Silently removes GTA VI spoilers from your feeds. Local text matching, made for mobile browsers; nothing leaves your device.',
          // Content scripts only: no offscreen document, no fetching.
          permissions: ['storage'],
        }
      : {
          name: 'Vice Guard - GTA 6 Spoiler Blocker',
          description:
            'Silently removes GTA VI spoilers from your feeds. Local text, OCR and image matching; nothing leaves your device.',
          permissions: ['storage', 'offscreen'],
          // Tesseract and onnxruntime are WebAssembly; MV3 blocks compiling it
          // unless allowed. Scripts still load only from the package ('self').
          content_security_policy: {
            extension_pages:
              "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
          },
          // Content scripts read pages; the offscreen document fetches
          // thumbnails the page already shows so they can be analysed locally.
          host_permissions: ['<all_urls>'],
        }),
    minimum_chrome_version: '116',
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
