import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Bookmark Sync',
    description: '跨浏览器书签同步插件',
    version: '1.0.0',
    permissions: [
      'bookmarks',
      'storage',
      'alarms',
      'notifications',
    ],
    host_permissions: [
      'https://api.github.com/*',
    ],
    options_ui: {
      open_in_tab: true,
    },
  },
});