import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    artifactTemplate: 'vice-guard-{{browser}}.zip',
    excludeSources: [
      'test-results/**',
      'playwright-report/**',
      '.browser-cache/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Vice Guard - GTA 6 Spoiler Blocker',
    description:
      'Keep GTA VI story spoilers out of your feed. Private, local, and open source.',
    permissions: ['storage'],
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'vice-guard@extensions.local',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
