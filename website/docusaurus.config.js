// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'claude-atelier',
  tagline: 'Jusqu\'à 90% de réduction sur les coûts de tokens Claude',
  favicon: 'img/favicon.ico',

  url: 'https://claude-atelier.vercel.app',
  baseUrl: '/',

  organizationName: 'malikkaraoui',
  projectName: 'claude-atelier',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr'],
  },

  plugins: [
    function noProgressPlugin() {
      return {
        name: 'no-progress-plugin',
        configureWebpack(config) {
          config.plugins = (config.plugins || []).filter(
            (p) => p.constructor && p.constructor.name !== 'WebpackBar'
          );
          return {};
        },
      };
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/malikkaraoui/claude-atelier/edit/main/website/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.png',
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        logo: {
          alt: '🛠️',
          src: 'img/logo.svg',
          className: 'navbar-logo-emoji',
        },
        title: 'claude-atelier',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://www.npmjs.com/package/claude-atelier',
            label: 'npm',
            position: 'right',
          },
          {
            href: 'https://github.com/malikkaraoui/claude-atelier',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {label: '💰 Token Savings', to: '/token-savings'},
              {label: 'Installation', to: '/installation'},
              {label: 'Hooks', to: '/hooks'},
              {label: 'Mode Nuit', to: '/mode-nuit'},
            ],
          },
          {
            title: 'Liens',
            items: [
              {label: 'npm', href: 'https://www.npmjs.com/package/claude-atelier'},
              {label: 'GitHub', href: 'https://github.com/malikkaraoui/claude-atelier'},
              {label: 'Issues', href: 'https://github.com/malikkaraoui/claude-atelier/issues'},
            ],
          },
        ],
        copyright: `MIT License · claude-atelier · ${new Date().getFullYear()}`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'markdown'],
      },
    }),
};

export default config;
