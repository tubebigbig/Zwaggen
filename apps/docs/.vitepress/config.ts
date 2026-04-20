import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

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
              { text: 'Type Inheritance', link: '/guide/type-inheritance' },
              { text: 'Folders', link: '/guide/folders' },
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
              { text: '型別繼承', link: '/zh-TW/guide/type-inheritance' },
              { text: '資料夾', link: '/zh-TW/guide/folders' },
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

  transformPageData(pageData) {
    // Per-page <meta name="description"> falls back to site description.
    if (!pageData.description) {
      pageData.description =
        (pageData.frontmatter as { description?: string } | undefined)?.description ??
        'Typed API spec builder + runtime tester';
    }
  },

  transformHead({ pageData }) {
    const SITE = 'https://docs.zwaggen.com';
    const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;

    // relativePath is e.g. 'introduction.md' or 'zh-TW/guide/endpoints.md'
    const rel = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const path = rel === '' ? '/' : `/${rel}`;
    const isZh = path.startsWith('/zh-TW');
    const enPath = isZh ? (path.replace(/^\/zh-TW\/?/, '/') || '/') : path;
    const zhPath = enPath === '/' ? '/zh-TW/' : `/zh-TW${enPath}`;

    const url = `${SITE}${path}`;
    const enUrl = `${SITE}${enPath}`;
    const zhUrl = `${SITE}${zhPath}`;

    const title = pageData.title ?? 'Zwaggen';
    const description = pageData.description ?? 'Typed API spec builder + runtime tester';
    const isHome = path === '/' || path === '/zh-TW/';

    return [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
      ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
      ['link', { rel: 'shortcut icon', href: '/favicon.ico' }],
      ['meta', { name: 'theme-color', content: '#4f46e5' }],
      // OpenGraph
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ['meta', { property: 'og:site_name', content: 'Zwaggen' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: DEFAULT_OG_IMAGE }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:locale', content: isZh ? 'zh_TW' : 'en_US' }],
      ['meta', { property: 'og:locale:alternate', content: isZh ? 'en_US' : 'zh_TW' }],

      // Twitter
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: DEFAULT_OG_IMAGE }],

      // Canonical + hreflang
      ['link', { rel: 'canonical', href: url }],
      ['link', { rel: 'alternate', hreflang: 'en', href: enUrl }],
      ['link', { rel: 'alternate', hreflang: 'zh-TW', href: zhUrl }],
      ['link', { rel: 'alternate', hreflang: 'x-default', href: enUrl }],
    ];
  },

  sitemap: {
    hostname: 'https://docs.zwaggen.com',
  },

}));
