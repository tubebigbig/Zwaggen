import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { VitePWA } from 'vite-plugin-pwa';
import { generateSW } from 'workbox-build';
import { resolve } from 'node:path';

const GITHUB_URL = 'https://github.com/tubebigbig/Zwaggen';
const PLAYGROUND_URL = 'https://play.zwaggen.com';

export default withMermaid(defineConfig({
  title: 'Zwaggen',
  description: 'Typed API spec builder + runtime tester',
  cleanUrls: true,
  ignoreDeadLinks: false,

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/introduction' },
          { text: 'Playground', link: PLAYGROUND_URL },
          { text: 'GitHub', link: GITHUB_URL },
        ],
        sidebar: [
          {
            text: 'Getting Started',
            items: [
              { text: 'Introduction', link: '/introduction' },
              { text: 'Installation', link: '/installation' },
              { text: 'Quickstart', link: '/quickstart' },
            ],
          },
          {
            text: 'Guide',
            items: [
              { text: 'Core Concepts', link: '/guide/core-concepts' },
              { text: 'Type Builder', link: '/guide/type-builder' },
              { text: 'Endpoints', link: '/guide/endpoints' },
              { text: 'Running Requests', link: '/guide/running-requests' },
              { text: 'Assertions & Chaining', link: '/guide/assertions-and-chaining' },
              { text: 'Batch & History', link: '/guide/batch-and-history' },
              { text: 'OpenAPI Import', link: '/guide/openapi-import' },
              { text: 'Spec Diff', link: '/guide/spec-diff' },
              { text: 'Export & cURL', link: '/guide/export-and-curl' },
              { text: 'CORS Proxy', link: '/guide/cors-proxy' },
            ],
          },
        ],
      },
    },
    'zh-TW': {
      label: '繁體中文',
      lang: 'zh-TW',
      link: '/zh-TW/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh-TW/introduction' },
          { text: 'Playground', link: PLAYGROUND_URL },
          { text: 'GitHub', link: GITHUB_URL },
        ],
        sidebar: [
          {
            text: '開始使用',
            items: [
              { text: 'Zwaggen', link: '/zh-TW/' },
              { text: '介紹', link: '/zh-TW/introduction' },
              { text: '安裝與環境需求', link: '/zh-TW/installation' },
              { text: '快速上手', link: '/zh-TW/quickstart' },
            ],
          },
          {
            text: '指南',
            items: [
              { text: '核心概念', link: '/zh-TW/guide/core-concepts' },
              { text: '型別建構器', link: '/zh-TW/guide/type-builder' },
              { text: '端點', link: '/zh-TW/guide/endpoints' },
              { text: '執行請求', link: '/zh-TW/guide/running-requests' },
              { text: '斷言與串接', link: '/zh-TW/guide/assertions-and-chaining' },
              { text: '批次與歷史紀錄', link: '/zh-TW/guide/batch-and-history' },
              { text: 'OpenAPI 匯入', link: '/zh-TW/guide/openapi-import' },
              { text: '規格差異', link: '/zh-TW/guide/spec-diff' },
              { text: '匯出與 cURL', link: '/zh-TW/guide/export-and-curl' },
              { text: 'CORS Proxy', link: '/zh-TW/guide/cors-proxy' },
            ],
          },
        ],
      },
    },
  },

  themeConfig: {
    socialLinks: [{ icon: 'github', link: GITHUB_URL }],
    search: { provider: 'local' },
  },

  markdown: {
    config: (md) => {
      const escapeHtml = md.utils.escapeHtml;
      md.renderer.rules.code_inline = (tokens, idx, _opts, _env, slf) => {
        const token = tokens[idx];
        return `<code${slf.renderAttrs(token)} v-pre>${escapeHtml(token.content)}</code>`;
      };
    },
  },

  transformHead: ({ assets }) => {
    return [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['meta', { name: 'theme-color', content: '#4f46e5' }],
      ['link', { rel: 'manifest', href: '/manifest.webmanifest' }],
    ];
  },

  async buildEnd(siteConfig) {
    const distDir = siteConfig.outDir;
    const { count, size, warnings } = await generateSW({
      globDirectory: distDir,
      globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,ico}'],
      globIgnores: ['**/sw.js', '**/workbox-*.js', '**/registerSW.js'],
      swDest: resolve(distDir, 'sw.js'),
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
    });
    for (const w of warnings) console.warn('[PWA]', w);
    console.log(`[PWA] precached ${count} files (${(size / 1024).toFixed(0)} KiB).`);
  },

  vite: {
    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,ico}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          name: 'Zwaggen Docs',
          short_name: 'Zwaggen',
          description: 'Typed API spec builder + runtime tester — documentation',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#4f46e5',
          background_color: '#ffffff',
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
  },
}));
