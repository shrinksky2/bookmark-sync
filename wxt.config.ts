import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Bookmark Sync',
    description: '跨浏览器书签同步插件',
    version: '1.0.1',
    permissions: [
      'bookmarks',
      'storage',
      'alarms',
      'notifications',
    ],
    host_permissions: [
      'https://api.github.com/*',
    ],
    optional_host_permissions: [
      'http://*/*',
      'https://*/*',
    ],
  },
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
});