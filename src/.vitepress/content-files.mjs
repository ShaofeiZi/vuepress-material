import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const postsDir = resolve(import.meta.dirname, '../posts')

function normalizeDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/)
  if (!match) return ''
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}

export function readPostRoutes() {
  return readdirSync(postsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => {
      const source = readFileSync(resolve(postsDir, file), 'utf8')
      const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1] || ''
      const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim() || ''
      const date = normalizeDate(frontmatter.match(/^date:\s*(.+)$/m)?.[1])
      const tags = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m)?.[1]
        .split(',')
        .map(tag => tag.trim().replace(/^(['"])(.*)\1$/, '$2'))
        .filter(Boolean) || []

      return { file, title, date, tags }
    })
}

export function readSortedPostRoutes() {
  return readPostRoutes().sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.file.localeCompare(b.file))
}
