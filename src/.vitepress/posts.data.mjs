import { createContentLoader } from 'vitepress'

const loader = createContentLoader('posts/*.md', {
  excerpt: '<!-- more -->',
  includeSrc: true,
  render: true,
  transform(raw) {
    return raw
      .map(page => {
        const frontmatter = page.frontmatter || {}
        const date = normalizeDate(frontmatterValue(page.src, 'date') || frontmatter.date)
        const description = String(frontmatter.description || '').trim()
        const cover = String(frontmatter.cover || '').trim()
        const excerpt = withBaseForPublicImages(
          page.excerpt || description || fallbackExcerpt(page.src)
        )
        const url = keepHtmlExtension(page.url)

        return {
          title: String(frontmatter.title || '').trim(),
          date,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
          url,
          slug: decodeURIComponent(url.slice(url.lastIndexOf('/') + 1, -5)),
          excerpt,
          description: description || plainText(excerpt).slice(0, 180),
          cover,
          coverAlt: String(frontmatter.coverAlt || '').trim(),
          coverLabel: String(frontmatter.coverLabel || '').trim(),
          headers: extractHeaders(page.html)
        }
      })
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.url.localeCompare(b.url))
  }
})

export default loader

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    const hour = String(value.getHours()).padStart(2, '0')
    const minute = String(value.getMinutes()).padStart(2, '0')
    const second = String(value.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
  }
  const source = String(value || '').trim()
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/)
  if (!match) return source
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}

function frontmatterValue(source = '', key) {
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || ''
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() || ''
}

function keepHtmlExtension(url) {
  const decoded = decodeURI(url)
  if (decoded.endsWith('.html')) return decoded
  return `${decoded.replace(/\/$/, '')}.html`
}

function fallbackExcerpt(source = '') {
  const body = source.replace(/^---[\s\S]*?---\s*/, '').split('<!-- more -->', 1)[0]
  return plainText(body).slice(0, 240)
}

function withBaseForPublicImages(html = '') {
  return String(html).replace(
    /((?:src|srcset)=["'])\/images\//gi,
    '$1/BLOG/images/'
  )
}

function extractHeaders(html = '') {
  const headers = []
  const pattern = /<h([2-6])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi
  for (const match of String(html).matchAll(pattern)) {
    const title = plainText(match[3].replace(/<a\b[\s\S]*?<\/a>/gi, ''))
    if (title) headers.push({ level: Number(match[1]), title, slug: match[2] })
  }
  return headers
}

function plainText(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
