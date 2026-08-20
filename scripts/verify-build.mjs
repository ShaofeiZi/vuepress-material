#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, process.argv[2] || 'docs')
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src')
const PUBLIC_DIR = path.join(SOURCE_DIR, 'public')
const SITE_ORIGIN = 'https://shaofeizi.github.io'
const SITE_BASE = '/BLOG/'
const OUTPUT_LABEL = path.relative(PROJECT_ROOT, OUTPUT_DIR) || '.'

const errors = []
const errorKeys = new Set()
let checkedReferences = 0

function fail (message, key = message) {
  if (!errorKeys.has(key)) {
    errorKeys.add(key)
    errors.push(message)
  }
}

function decodeHtmlAttribute (value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function decodeHtmlText (value) {
  return decodeHtmlAttribute(value).replace(/&nbsp;/gi, ' ')
}

async function getStats (filePath) {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function walk (directory) {
  const files = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      fail(
        `Generated output must not contain symbolic links: ${path.relative(OUTPUT_DIR, entryPath)}`,
        `symlink:${entryPath}`
      )
    } else if (entry.isDirectory()) {
      files.push(...await walk(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

async function requireNonEmptyFile (relativePath, description = relativePath) {
  const filePath = path.join(OUTPUT_DIR, relativePath)
  const stats = await getStats(filePath)

  if (!stats || !stats.isFile()) {
    fail(`Missing ${description}: ${OUTPUT_LABEL}/${relativePath}`, `required:${relativePath}`)
    return false
  }
  if (stats.size === 0) {
    fail(`Empty ${description}: ${OUTPUT_LABEL}/${relativePath}`, `empty:${relativePath}`)
    return false
  }
  return true
}

function deployedPathForHtml (relativePath) {
  const normalized = relativePath.split(path.sep).join('/')
  if (normalized === 'index.html') return SITE_BASE
  if (normalized.endsWith('/index.html')) {
    return SITE_BASE + normalized.slice(0, -'index.html'.length)
  }
  return SITE_BASE + normalized
}

async function findOutputTarget (relativeUrlPath) {
  const cleanPath = relativeUrlPath.replace(/^\/+/, '')
  const candidates = []

  if (!cleanPath || cleanPath.endsWith('/')) {
    candidates.push(path.join(cleanPath, 'index.html'))
  } else {
    candidates.push(cleanPath)
    if (!path.posix.extname(cleanPath)) {
      candidates.push(`${cleanPath}.html`, path.join(cleanPath, 'index.html'))
    }
  }

  for (const candidate of candidates) {
    const absolutePath = path.resolve(OUTPUT_DIR, candidate)
    const outputPrefix = OUTPUT_DIR + path.sep
    if (absolutePath !== OUTPUT_DIR && !absolutePath.startsWith(outputPrefix)) {
      fail(`Generated URL escapes ${OUTPUT_LABEL}: ${relativeUrlPath}`, `escape:${relativeUrlPath}`)
      return null
    }

    const stats = await getStats(absolutePath)
    if (stats && stats.isFile()) return absolutePath
  }

  return null
}

async function checkReference (rawValue, pagePath, context, options = {}) {
  const value = decodeHtmlAttribute(rawValue.trim())
  if (!value || value.startsWith('#') || value.startsWith('?')) return

  if (/^\/\/BLOG(?:\/|$)/i.test(value)) {
    fail(`${context} uses malformed protocol-relative BLOG URL: ${value}`, `protocol-relative:${value}`)
    return
  }

  let resolved
  try {
    resolved = new URL(value, SITE_ORIGIN + pagePath)
  } catch {
    fail(`${context} contains an invalid URL: ${value}`, `invalid-url:${value}`)
    return
  }

  if (!['http:', 'https:'].includes(resolved.protocol)) {
    if (!['data:', 'mailto:', 'tel:', 'javascript:', 'blob:'].includes(resolved.protocol)) {
      fail(`${context} uses unsupported URL scheme: ${value}`, `scheme:${value}`)
    }
    return
  }
  if (resolved.origin !== SITE_ORIGIN) return

  checkedReferences += 1
  const pathname = resolved.pathname
  if (!pathname.startsWith(SITE_BASE)) {
    fail(
      `${context} points outside the production base ${SITE_BASE}: ${value}`,
      `outside-base:${value}`
    )
    return
  }
  if (pathname.startsWith(`${SITE_BASE}BLOG/`)) {
    fail(`${context} repeats the production base: ${value}`, `double-base:${value}`)
    return
  }

  let relativeUrlPath
  try {
    relativeUrlPath = decodeURIComponent(pathname.slice(SITE_BASE.length))
  } catch {
    fail(`${context} contains malformed URL encoding: ${value}`, `encoding:${value}`)
    return
  }

  let target = await findOutputTarget(relativeUrlPath)
  // VitePress emits .html files when cleanUrls is false. Keep one explicit
  // compatibility path for legacy same-origin tag links that ended in `/`.
  if (!target && /^tags\/[^/]+\/$/u.test(relativeUrlPath)) {
    target = await findOutputTarget(`${relativeUrlPath.slice(0, -1)}.html`)
  }
  if (target) return

  fail(
    `${context} references a missing generated file: ${value}`,
    `missing-ref:${relativeUrlPath}`
  )
}

function parseAttributes (tagSource) {
  const attributes = new Map()
  const pattern = /([^\s"'<>\/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match
  while ((match = pattern.exec(tagSource)) !== null) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function extractCssUrls (source) {
  const urls = []
  const pattern = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi
  let match
  while ((match = pattern.exec(source)) !== null) {
    urls.push((match[2] ?? match[3] ?? '').trim())
  }
  return urls
}

async function verifyHtmlFile (filePath) {
  const relativePath = path.relative(OUTPUT_DIR, filePath)
  const pagePath = deployedPathForHtml(relativePath)
  const html = await readFile(filePath, 'utf8')
  const tagPattern = /<([a-z][\w:-]*)\b[^>]*>/gi
  let tagMatch

  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const tagName = tagMatch[1].toLowerCase()
    const attributes = parseAttributes(tagMatch[0])
    const context = `${OUTPUT_LABEL}/${relativePath} <${tagName}>`

    for (const attributeName of ['src', 'poster']) {
      if (attributes.has(attributeName)) {
        await checkReference(attributes.get(attributeName), pagePath, context, { requireFile: true })
      }
    }

    if (attributes.has('href')) {
      await checkReference(
        attributes.get('href'),
        pagePath,
        context,
        { requireFile: tagName === 'link' }
      )
    }

    if (attributes.has('srcset')) {
      for (const candidate of attributes.get('srcset').split(',')) {
        const candidateUrl = candidate.trim().split(/\s+/, 1)[0]
        await checkReference(candidateUrl, pagePath, context, { requireFile: true })
      }
    }

    if (attributes.has('style')) {
      for (const url of extractCssUrls(attributes.get('style'))) {
        await checkReference(url, pagePath, context, { requireFile: true })
      }
    }

    if (tagName === 'meta' && attributes.has('content')) {
      const metaKey = (attributes.get('name') || attributes.get('property') || '').toLowerCase()
      if (['msapplication-tileimage', 'og:image', 'twitter:image'].includes(metaKey)) {
        await checkReference(attributes.get('content'), pagePath, context, { requireFile: true })
      }
    }
  }
}

async function verifyManifest () {
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    fail(`Invalid ${OUTPUT_LABEL}/manifest.json: ${error.message}`, 'manifest-json')
    return
  }

  const references = [
    ['start_url', manifest.start_url, true],
    ['scope', manifest.scope, false],
    ...((manifest.icons || []).map((icon, index) => [`icons[${index}].src`, icon.src, true])),
    ...((manifest.screenshots || []).map((image, index) => [`screenshots[${index}].src`, image.src, true]))
  ]

  for (const [field, value, requireFile] of references) {
    if (typeof value === 'string') {
      await checkReference(
        value,
        `${SITE_BASE}manifest.json`,
        `${OUTPUT_LABEL}/manifest.json ${field}`,
        { requireFile }
      )
    }
  }
}

async function verifyMarkdownOutputs () {
  const sourceFiles = await walk(SOURCE_DIR)
  for (const sourceFile of sourceFiles.filter(file => file.endsWith('.md') && !file.includes(`[${path.sep === '\\' ? '\\' : '/'}]`))) {
    const relativeSource = path.relative(SOURCE_DIR, sourceFile)
    if (relativeSource.split(path.sep).some(segment => /^\[.+\]\.md$/.test(segment))) continue
    const parsed = path.parse(relativeSource)
    const outputPath = /^(index|readme)$/i.test(parsed.name)
      ? path.join(parsed.dir, 'index.html')
      : path.join(parsed.dir, `${parsed.name}.html`)
    await requireNonEmptyFile(outputPath, `rendered page for src/${relativeSource}`)
  }
}

async function verifyDynamicOutputs () {
  const { readPostRoutes, readSortedPostRoutes } = await import('../src/.vitepress/content-files.mjs')
  const posts = readSortedPostRoutes()
  const pageSize = 5
  const totalPages = Math.ceil(posts.length / pageSize)
  for (let page = 2; page <= totalPages; page += 1) {
    const relativePath = `page/${page}.html`
    if (await requireNonEmptyFile(relativePath, `rendered pagination page ${page}`)) {
      const html = await readFile(path.join(OUTPUT_DIR, relativePath), 'utf8')
      const titles = [...html.matchAll(/class="post-title-link"[^>]*>([^<]+)/g)].map(match => decodeHtmlText(match[1]))
      const expected = posts.slice((page - 1) * pageSize, page * pageSize).map(post => post.title)
      if (JSON.stringify(titles) !== JSON.stringify(expected)) {
        fail(`Pagination page ${page} rendered the wrong posts.`, `page-content:${page}`)
      }
      if (!html.includes(`<title>第 ${page} 页 · 做个日常记录</title>`)) {
        fail(`Pagination page ${page} has the wrong document title.`, `page-title:${page}`)
      }
    }
  }

  const tags = [...new Set(readPostRoutes().flatMap(post => post.tags))]
  const tagsIndex = await readFile(path.join(OUTPUT_DIR, 'tags', 'index.html'), 'utf8')
  for (const tag of tags) {
    const href = `/BLOG/tags/?tag=${encodeURIComponent(tag)}`
    if (!tagsIndex.includes(`href="${href}"`)) {
      fail(`Tag index is missing exact link ${href}.`, `tag-link:${tag}`)
    }
  }

  return { totalPages, tagCount: tags.length }
}

async function verifyRenderedSemantics () {
  const indexHtml = await readFile(path.join(OUTPUT_DIR, 'index.html'), 'utf8')
  if (!indexHtml.includes('<title>ShaofeiZi Blog · 做个日常记录</title>')) {
    fail('Home page title no longer matches the historical blog title.', 'home-title')
  }
  const homeCards = (indexHtml.match(/class="post-card/g) || []).length
  if (homeCards !== 5) {
    fail(`Home page rendered ${homeCards} post cards instead of 5.`, 'home-card-count')
  }
  const articleHtml = await readFile(path.join(OUTPUT_DIR, 'posts', 'rxjs23.html'), 'utf8')
  for (const expected of ['article-card', '上一篇', '下一篇', '/BLOG/tags/?tag=RXJS']) {
    if (!articleHtml.includes(expected)) {
      fail(`Representative article is missing ${JSON.stringify(expected)}.`, `article-semantic:${expected}`)
    }
  }

  const imageArticle = await readFile(path.join(OUTPUT_DIR, 'posts', 'angular_concept.html'), 'utf8')
  if (!imageArticle.includes('/BLOG/images/angular_concept/001.png')) {
    fail('Representative article image is missing the production base.', 'article-image-base')
  }
}

async function verifyPublicMirror () {
  const publicFiles = await walk(PUBLIC_DIR)
  for (const publicFile of publicFiles) {
    const relativePath = path.relative(PUBLIC_DIR, publicFile)
    const sourceStats = await getStats(publicFile)
    const outputPath = path.join(OUTPUT_DIR, relativePath)
    const outputStats = await getStats(outputPath)
    if (!outputStats?.isFile()) {
      fail(`Public file is missing from the build: ${relativePath}`, `public-missing:${relativePath}`)
      continue
    }
    if (outputStats.size !== sourceStats.size || outputStats.size === 0) {
      fail(`Public file differs from the source copy: ${relativePath}`, `public-size:${relativePath}`)
    }
  }
  return publicFiles.length
}

async function main () {
  const outputStats = await getStats(OUTPUT_DIR)
  if (!outputStats || !outputStats.isDirectory()) {
    console.error(`Build verification failed: output directory ${OUTPUT_LABEL} does not exist.`)
    process.exitCode = 1
    return
  }

  const allFiles = await walk(OUTPUT_DIR)
  const relativeFiles = allFiles.map(file => path.relative(OUTPUT_DIR, file).split(path.sep).join('/'))

  for (const requiredPath of [
    'index.html',
    '404.html',
    'about/index.html',
    'tags/index.html',
    'favicon.ico',
    'face.png',
    'manifest.json',
    'icons/192.png',
    'icons/512.png'
  ]) {
    await requireNonEmptyFile(requiredPath)
  }

  const scriptBundles = relativeFiles.filter(file => /^assets\/.+\.js$/i.test(file))
  const styleBundles = relativeFiles.filter(file => /^assets\/.+\.css$/i.test(file))
  if (scriptBundles.length === 0) fail(`No Vite JavaScript assets were generated in ${OUTPUT_LABEL}/assets/.`, 'vite-js-assets')
  if (styleBundles.length === 0) fail(`No Vite CSS assets were generated in ${OUTPUT_LABEL}/assets/.`, 'vite-css-assets')
  if (relativeFiles.some(file => /^assets\/js\/app\.[0-9a-f]{8}\.js$/i.test(file))) {
    fail('Stale VuePress/Webpack app bundle found in the generated output.', 'stale-webpack-bundle')
  }

  const indexHtml = await readFile(path.join(OUTPUT_DIR, 'index.html'), 'utf8')
  if (!/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=/i.test(indexHtml) &&
      !/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*\btype=["']module["']/i.test(indexHtml)) {
    fail('index.html does not contain a Vite module entry; the output may be stale.', 'vite-module-entry')
  }

  await verifyMarkdownOutputs()
  const dynamicRoutes = await verifyDynamicOutputs()
  await verifyRenderedSemantics()
  const publicFileCount = await verifyPublicMirror()

  for (const htmlFile of allFiles.filter(file => file.endsWith('.html'))) {
    await verifyHtmlFile(htmlFile)
  }

  for (const cssFile of allFiles.filter(file => file.endsWith('.css'))) {
    const relativePath = path.relative(OUTPUT_DIR, cssFile).split(path.sep).join('/')
    const source = await readFile(cssFile, 'utf8')
    for (const url of extractCssUrls(source)) {
      await checkReference(
        url,
        SITE_BASE + relativePath,
        `${OUTPUT_LABEL}/${relativePath} url()`,
        { requireFile: true }
      )
    }
  }

  await verifyManifest()

  if (errors.length > 0) {
    console.error(`Build verification failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }

  const htmlCount = allFiles.filter(file => file.endsWith('.html')).length
  console.log(
    `Build verification passed: ${allFiles.length} files, ${htmlCount} HTML pages, ` +
    `${checkedReferences} local references, ${dynamicRoutes.totalPages} pagination pages, ` +
    `${dynamicRoutes.tagCount} exact tags, ${publicFileCount} public files, base ${SITE_BASE}.`
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
