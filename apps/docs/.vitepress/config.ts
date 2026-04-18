import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const GITHUB_URL = 'https://github.com/vliang/Zwaggen';

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
          { text: 'GitHub', link: GITHUB_URL },
        ],
        sidebar: [
          {
            text: '開始使用',
            items: [
              { text: 'Zwaggen', link: '/zh-TW/' },
              { text: '介紹', link: '/zh-TW/introduction' },
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
}));
