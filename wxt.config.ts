import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  browser: 'chrome',
  zip: {
    artifactTemplate: 'vice-guard-{{browser}}.zip',
    excludeSources: [
      'test-results/**',
      'playwright-report/**',
      '.browser-cache/**',
      '.model-cache/**',
    ],
  },
  vite: () => ({
    resolve: {
      alias: [
        {
          // CPU-only onnxruntime: a 14 MB wasm instead of the 28 MB WebGPU one,
          // loaded from public/ort rather than bundled a second time.
          find: /^onnxruntime-web(\/webgpu)?$/,
          replacement: resolve('node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'),
        },
      ],
    },
    worker: { format: 'es' },
  }),
  manifest: {
    name: 'Vice Guard - GTA 6 Spoiler Blocker',
    description:
      'Silently removes GTA VI spoilers from your feeds. Local text, OCR and image matching; nothing leaves your device.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'offscreen'],
    // Content scripts read pages; the offscreen document fetches thumbnails
    // the page already shows so they can be analysed locally.
    host_permissions: ['<all_urls>'],
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
