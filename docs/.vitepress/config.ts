import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'SiYuan MCP Sisyphus',
  description: 'Documentation for SiYuan MCP Sisyphus Plugin',

  // 多语言配置
  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
    },
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/en/architecture' },
      { text: 'API Reference', link: '/en/api-reference' },
      { text: 'Development', link: '/en/development-guide' },
      { text: 'Deployment', link: '/en/deployment' },
    ],

    sidebar: {
      '/en/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/en/' },
            { text: 'Architecture', link: '/en/architecture' },
            { text: 'Deployment', link: '/en/deployment' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'API Reference', link: '/en/api-reference' },
            { text: 'Insights', link: '/insights' },
          ],
        },
        {
          text: 'Development',
          items: [
            { text: 'Development Guide', link: '/en/development-guide' },
            { text: 'Contributing', link: '/en/development-guide#contributing' },
          ],
        },
      ],
      '/zh/': [
        {
          text: '快速开始',
          items: [
            { text: '概述', link: '/zh/' },
            { text: '架构', link: '/zh/architecture' },
            { text: '部署', link: '/zh/deployment' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: 'API 参考', link: '/zh/api-reference' },
            { text: '经验洞察', link: '/insights' },
          ],
        },
        {
          text: '开发',
          items: [
            { text: '开发指南', link: '/zh/development-guide' },
            { text: '贡献指南', link: '/zh/development-guide#贡献指南' },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus',
      },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Taihong Yang',
    },

    search: {
      provider: 'local',
    },
  },
})
