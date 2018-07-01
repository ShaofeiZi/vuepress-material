const path = require('path')
const nodeExternals = require('webpack-node-externals')

const resolve = pathName => path.join(__dirname, pathName)
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  base: isProd ? '/BLOG/' : '/',
  dest: 'docs',
  title: "ShaofeiZi Blog",
  description: '訾绍飞的博客。万物皆有裂缝处，那是光射进来的地方。',
  head: [
    ['link', { rel: 'shortcut icon', href: '/favicon.ico' }],
    ['link', { rel: 'manifest', href: '/manifest.json' }],
    ['meta', { name: 'theme-color', content: '#3F51B5' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
    ['link', { rel: 'apple-touch-icon', href: '/icons/192.png' }],
    ['link', { rel: 'mask-icon', href: '/icons/safari-pinned-tab.svg', color: '#3eaf7c' }],
    ['meta', { name: 'msapplication-TileImage', content: '/icons/192.png' }],
    ['meta', { name: 'msapplication-TileColor', content: '#3F51B5' }]
  ],
  serviceWorker: true,
  theme: '',
  locales: {
    '/': {
      lang: 'zh-CN',
      title: "ShaofeiZi Blog",
      description: '訾绍飞的博客。万物皆有裂缝处，那是光射进来的地方。'
    }
  },
  configureWebpack: (config, isServer) => {
    const myConfig = {
      resolve: {
        alias: {
          '@pub': resolve('./public')
        }
      },
      module: {
        rules: [{
          test: /vuetify.+\.js$/,
          loader: resolve('./ignoreStylus'),
        }]
      }
    }
    if (isServer) {
      myConfig.externals = nodeExternals({
        whitelist: [/vuetify/, /fortawesome/, /prismjs/]
      })
    }
    return myConfig
  },
  themeConfig: {
    lang: 'zh-CN',
    postDir: '/posts',
    subTitle: '做个日常记录',
    author: '訾绍飞',
    email: 'zishaofei221@gmail.com',
    since: 2015,
    avatar: '/face.png',
    avatarLink: '/',
    menus: [
      // icons by https://fontawesome.com/icons
      {
        text: 'Home',
        icon: 'fa fa-home',
        url: '/'
      },
      {
        text: 'Tags',
        icon: 'fa fa-tag',
        url: '/tags'
      },
      {
        text: 'Github',
        icon: 'fab fa-github',
        url: 'https://github.com/ShaofeiZi',
        external: true
      },
      {
        text: 'Weibo',
        icon: 'fab fa-weibo',
        url: 'https://weibo.com/6089509463',
        external: true
      },
      {
        text: 'About',
        icon: 'fa fa-user-secret',
        url: '/about'
      }
    ],
    socials: ['Weibo', 'QQ', 'Facebook', 'Twitter', 'GooglePlus'],
    colors: {
      // generate by https://vuetifyjs.com/zh-Hans/theme-generator
      primary: '#3F51B5',
      secondary: '#6d6d6d',
      accent: '#E91E63',
      error: '#f44336',
      warning: '#FFC107',
      info: '#00B8D4',
      success: '#4caf50'
    },
    format: {
      date: 'YYYY年MM月DD日',
      dateTime: 'YYYY年MM月DD日 HH:mm:ss'
    },
    pagination: {
      path: '/page/:pageNum',
      pageSize: 5
    },
    tags: {
      path: '/tags/:tagName'
    },
    categories: {
      path: '/categories/:category'
    }
  }
}
