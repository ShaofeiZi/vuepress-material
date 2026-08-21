import { defineConfig } from 'vitepress'

const base = '/BLOG/'
const withBase = path => `${base}${path.replace(/^\/+/, '')}`

export default defineConfig({
  lang: 'zh-CN',
  title: 'ShaofeiZi Blog',
  titleTemplate: ':title · 做个日常记录',
  description: '訾绍飞的博客。万物皆有裂缝处，那是光射进来的地方。',
  base,
  outDir: '../docs',
  cleanUrls: false,
  useWebFonts: false,
  srcExclude: ['README.md'],
  markdown: {
    math: {
      tex: {
        formatError(_jax, error) {
          throw new Error(`Invalid math expression: ${error?.message || String(error)}`)
        }
      }
    }
  },
  transformHead({ pageData }) {
    const cover = String(pageData.frontmatter?.cover || '').trim()
    if (!cover) return []

    const socialImage = String(pageData.frontmatter?.socialImage || '').trim() || cover
    const image = `https://shaofeizi.github.io${withBase(socialImage)}`
    const pagePath = String(pageData.relativePath || '').replace(/\.md$/i, '.html')
    const url = `https://shaofeizi.github.io${withBase(pagePath)}`
    const title = String(pageData.title || '')
    const description = String(pageData.description || '')
    const imageAlt = String(pageData.frontmatter.coverAlt || title)
    return [
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:type', content: 'article' }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: image }],
      ['meta', { property: 'og:image:alt', content: imageAlt }],
      ['meta', { property: 'og:image:type', content: 'image/png' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image }],
      ['meta', { name: 'twitter:image:alt', content: imageAlt }]
    ]
  },
  head: [
    ['link', { rel: 'shortcut icon', href: withBase('favicon.ico') }],
    ['link', { rel: 'manifest', href: withBase('manifest.json') }],
    ['meta', { name: 'theme-color', content: '#3F51B5' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
    ['link', { rel: 'apple-touch-icon', href: withBase('icons/192.png') }],
    ['meta', { name: 'msapplication-TileImage', content: withBase('icons/192.png') }],
    ['meta', { name: 'msapplication-TileColor', content: '#3F51B5' }]
  ],
  themeConfig: {
    lang: 'zh-CN',
    subTitle: '做个日常记录',
    author: '訾绍飞',
    email: 'zishaofei221@gmail.com',
    since: 2015,
    avatar: '/face.png',
    avatarLink: '/',
    menus: [
      { text: '首页', icon: 'home', url: '/' },
      { text: '标签', icon: 'tag', url: '/tags/' },
      { text: 'Github', icon: 'github', url: 'https://github.com/ShaofeiZi', external: true },
      { text: 'About', icon: 'user', url: '/about/' }
    ],
    socials: ['Weibo', 'QQ'],
    pagination: { pageSize: 5 },
    tags: { path: '/tags/?tag=:tag' },
    format: {
      date: 'YYYY年MM月DD日',
      dateTime: 'YYYY年MM月DD日 HH:mm:ss'
    }
  }
})
