export const isExternalLink = value =>
  /^(?:[a-z]+:)?\/\//i.test(value || '') || /^(?:mailto|tel):/i.test(value || '')

export function normalizePath(value = '/', base = '/') {
  let path = String(value).split(/[?#]/, 1)[0] || '/'

  try {
    path = decodeURI(path)
  } catch {
    // Keep the encoded path when it contains a malformed escape sequence.
  }

  if (base !== '/' && path.startsWith(base)) {
    path = `/${path.slice(base.length)}`
  }

  path = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '')
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path
}

export function findPost(posts, routePath, base = '/') {
  const current = normalizePath(routePath, base)
  return (posts || []).find(post => normalizePath(post.url, base) === current) || null
}

export function formatDate(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (match) {
      return `${match[1]}年${match[2].padStart(2, '0')}月${match[3].padStart(2, '0')}日`
    }
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`
}

export function plainText(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function postSummary(post) {
  return plainText(post?.description || post?.excerpt || '').slice(0, 180)
}

export function iconForMenu(item) {
  const source = `${item?.icon || ''} ${item?.text || ''} ${item?.url || item?.link || ''}`.toLowerCase()
  if (source.includes('github')) return 'github'
  if (source.includes('tag')) return 'tag'
  if (source.includes('about') || source.includes('user') || source.includes('关于')) return 'user'
  if (source.includes('home') || source.includes('首页')) return 'home'
  return item?.external || isExternalLink(item?.url || item?.link) ? 'external' : 'link'
}

export function tagHref(tag, withBase) {
  return `${withBase('/tags/')}?tag=${encodeURIComponent(tag)}`
}
