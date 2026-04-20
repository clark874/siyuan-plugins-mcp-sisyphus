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
      { text: 'Home', link: '/en/' },
      { text: 'Getting Started', link: '/en/getting-started/' },
      { text: 'Reference', link: '/en/reference/' },
      { text: 'Architecture', link: '/en/architecture/' },
      { text: 'Development', link: '/en/development/' },
    ],

    sidebar: {
      '/en/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/en/' },
            { text: 'Docs Home', link: '/' },
            { text: 'Start Here', link: '/en/getting-started/' },
            { text: 'Deployment', link: '/en/getting-started/deployment' },
            { text: 'HTTPS', link: '/en/getting-started/https' },
            { text: 'Troubleshooting', link: '/en/getting-started/troubleshooting' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Reference Home', link: '/en/reference/' },
            { text: 'Common Tasks', link: '/en/reference/common-tasks' },
            { text: 'Permissions', link: '/en/reference/permissions' },
            { text: 'Path Semantics', link: '/en/reference/path-semantics' },
            { text: 'Error Types', link: '/en/reference/error-types' },
            { text: 'Tools Index', link: '/en/reference/tools/' },
            { text: 'Insights', link: '/insights' },
          ],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Architecture Home', link: '/en/architecture/' },
            { text: 'Overview', link: '/en/architecture/overview' },
            { text: 'Modules', link: '/en/architecture/modules' },
            { text: 'Data Flow', link: '/en/architecture/data-flow' },
            { text: 'Design Decisions', link: '/en/architecture/design-decisions' },
            { text: 'Extension Points', link: '/en/architecture/extension-points' },
          ],
        },
        {
          text: 'Development',
          items: [
            { text: 'Development Home', link: '/en/development/' },
            { text: 'Setup', link: '/en/development/setup' },
            { text: 'Build and Workflow', link: '/en/development/build-and-workflow' },
            { text: 'Testing', link: '/en/development/testing' },
            { text: 'Conventions', link: '/en/development/conventions' },
            { text: 'Adding Tools', link: '/en/development/adding-tools' },
            { text: 'Adding Actions', link: '/en/development/adding-actions' },
            { text: 'Debugging', link: '/en/development/debugging' },
            { text: 'Release CLI', link: '/en/development/release-cli' },
          ],
        },
      ],
      '/zh/': [
        {
          text: '快速开始',
          items: [
            { text: '概述', link: '/zh/' },
            { text: '文档首页', link: '/' },
            { text: '开始使用', link: '/zh/getting-started/' },
            { text: 'Deployment', link: '/zh/getting-started/deployment' },
            { text: 'HTTPS', link: '/zh/getting-started/https' },
            { text: 'Troubleshooting', link: '/zh/getting-started/troubleshooting' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '参考首页', link: '/zh/reference/' },
            { text: '常见任务', link: '/zh/reference/common-tasks' },
            { text: '权限模型', link: '/zh/reference/permissions' },
            { text: '路径语义', link: '/zh/reference/path-semantics' },
            { text: '错误类型', link: '/zh/reference/error-types' },
            { text: '工具索引', link: '/zh/reference/tools/' },
            { text: '经验洞察', link: '/insights' },
          ],
        },
        {
          text: '架构',
          items: [
            { text: '架构首页', link: '/zh/architecture/' },
            { text: 'Overview', link: '/zh/architecture/overview' },
            { text: 'Modules', link: '/zh/architecture/modules' },
            { text: 'Data Flow', link: '/zh/architecture/data-flow' },
            { text: 'Design Decisions', link: '/zh/architecture/design-decisions' },
            { text: 'Extension Points', link: '/zh/architecture/extension-points' },
          ],
        },
        {
          text: '开发',
          items: [
            { text: '开发首页', link: '/zh/development/' },
            { text: 'Setup', link: '/zh/development/setup' },
            { text: 'Build and Workflow', link: '/zh/development/build-and-workflow' },
            { text: 'Testing', link: '/zh/development/testing' },
            { text: 'Conventions', link: '/zh/development/conventions' },
            { text: 'Adding Tools', link: '/zh/development/adding-tools' },
            { text: 'Adding Actions', link: '/zh/development/adding-actions' },
            { text: 'Debugging', link: '/zh/development/debugging' },
            { text: 'Release CLI', link: '/zh/development/release-cli' },
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
