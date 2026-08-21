#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import config from '../src/.vitepress/config.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src')
const POSTS_DIR = path.join(SOURCE_DIR, 'posts')
const PUBLIC_DIR = path.join(SOURCE_DIR, 'public')
const SITE_BASE = '/BLOG/'
const EXPECTED_POST_COUNT = 55
const EXPECTED_TAG_COUNT = 49
const errors = []
const tags = new Set()
const routeKeys = new Map()

function check (condition, message) {
  if (!condition) errors.push(message)
}

async function statsFor (filePath) {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function requireNonEmptyFile (relativePath) {
  const filePath = path.join(PROJECT_ROOT, relativePath)
  const stats = await statsFor(filePath)
  check(Boolean(stats?.isFile()), `Missing required file: ${relativePath}`)
  if (stats?.isFile()) {
    check(!stats.isSymbolicLink(), `Required file must not be a symbolic link: ${relativePath}`)
    check(stats.size > 0, `Required file is empty: ${relativePath}`)
  }
  return stats?.isFile() && stats.size > 0
}

async function walkFiles (directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      errors.push(`Symbolic links are not allowed in ${path.relative(PROJECT_ROOT, directory)}: ${entry.name}`)
    } else if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

function splitInlineYamlArray (source) {
  const values = []
  let buffer = ''
  let quote = null
  let escaped = false

  for (const character of source) {
    if (escaped) {
      buffer += character
      escaped = false
      continue
    }
    if (quote && character === '\\') {
      buffer += character
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      buffer += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      buffer += character
      continue
    }
    if (character === ',') {
      values.push(buffer)
      buffer = ''
      continue
    }
    buffer += character
  }
  values.push(buffer)

  return values.map(value => {
    const trimmed = value.trim()
    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      return trimmed.slice(1, -1)
    }
    return trimmed
  })
}

function parsePostFrontmatter (source, fileName) {
  const block = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1]
  if (!block) {
    errors.push(`${fileName}: missing YAML frontmatter` )
    return null
  }

  const title = block.match(/^title:\s*(.*?)\s*$/m)?.[1] || ''
  const date = block.match(/^date:\s*(.*?)\s*$/m)?.[1] || ''
  const tagsSource = block.match(/^tags:\s*\[([\s\S]*?)\]\s*$/m)?.[1]
  check(Boolean(title.trim()), `${fileName}: title must be a non-empty string`)
  check(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date) && !Number.isNaN(Date.parse(date.replace(' ', 'T') + '+08:00')),
    `${fileName}: date must be a valid YYYY-MM-DD HH:mm:ss value`
  )
  check(tagsSource !== undefined, `${fileName}: tags must be a non-empty inline array`)

  const postTags = tagsSource === undefined ? [] : splitInlineYamlArray(tagsSource)
  check(postTags.length > 0, `${fileName}: tags must contain at least one value`)
  const seenTags = new Set()
  for (const tag of postTags) {
    check(Boolean(tag), `${fileName}: tags must not contain empty values`)
    check(tag === tag.trim(), `${fileName}: tag has surrounding whitespace: ${JSON.stringify(tag)}`)
    check(!seenTags.has(tag), `${fileName}: duplicate tag ${JSON.stringify(tag)}`)
    check(!/[\/\\]/.test(tag) && tag !== '.' && tag !== '..', `${fileName}: unsafe tag route value ${JSON.stringify(tag)}`)
    seenTags.add(tag)
    if (tag) tags.add(tag)
  }

  return { title: title.trim(), date, tags: postTags }
}

function extractLocalImagePaths (source) {
  const references = []
  for (const match of source.matchAll(/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g)) {
    references.push(match[1])
  }
  for (const match of source.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    references.push(...match[1].split(',').map(value => value.trim().split(/\s+/, 1)[0]))
  }
  return references.filter(value => value.startsWith('/images/'))
}

async function checkPublicReference (reference, fileName) {
  let decoded
  try {
    decoded = decodeURI(reference.slice(1))
  } catch {
    errors.push(`${fileName}: malformed image URL ${reference}`)
    return
  }
  check(!decoded.includes('\0') && !decoded.includes('\\'), `${fileName}: unsafe image URL ${reference}`)
  const target = path.resolve(PUBLIC_DIR, decoded)
  const publicPrefix = PUBLIC_DIR + path.sep
  if (!target.startsWith(publicPrefix)) {
    errors.push(`${fileName}: image URL escapes src/public: ${reference}`)
    return
  }
  const stats = await statsFor(target)
  check(Boolean(stats?.isFile() && stats.size > 0), `${fileName}: missing public asset ${reference}`)
}

function frontmatterLayout (source) {
  return source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1]
    ?.match(/^layout:\s*([^#\r\n]+?)\s*$/m)?.[1]
    ?.trim()
}

async function main () {
  const packageJson = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package-lock.json'), 'utf8'))
  const lockRoot = lockfile.packages?.[''] || {}
  const nvmVersion = (await readFile(path.join(PROJECT_ROOT, '.nvmrc'), 'utf8')).trim()

  check(packageJson.type === 'module', 'package.json type must be module')
  check(packageJson.dependencies?.vitepress === '1.6.4', 'VitePress must be pinned to 1.6.4')
  check(packageJson.dependencies?.vue === '3.5.41', 'Vue must be pinned to 3.5.41')
  check(packageJson.overrides?.vite === '6.4.3', 'Vite must be pinned to the latest VitePress-compatible secure release 6.4.3')
  check(packageJson.packageManager === 'npm@10.9.7', 'packageManager must pin npm 10.9.7')
  check(packageJson.engines?.node === '22.22.x', 'package.json engines.node must be 22.22.x')
  check(nvmVersion === '22.22.2', '.nvmrc must select Node 22.22.2')
  check(lockRoot.name === packageJson.name && lockRoot.version === packageJson.version, 'package-lock root metadata does not match package.json')
  check(JSON.stringify(lockRoot.dependencies) === JSON.stringify(packageJson.dependencies), 'package-lock root dependencies do not match package.json')
  check(JSON.stringify(lockRoot.engines) === JSON.stringify(packageJson.engines), 'package-lock root engine does not match package.json')
  check(lockfile.packages?.['node_modules/vite']?.version === '6.4.3', 'package-lock must resolve Vite 6.4.3')

  check(config.base === SITE_BASE, `VitePress base must be ${SITE_BASE}`)
  check(config.outDir === '../docs', 'VitePress outDir must be ../docs')
  check(config.cleanUrls === false, 'VitePress cleanUrls must remain false to preserve .html URLs')
  check(config.srcExclude?.includes('README.md'), 'VitePress srcExclude must include README.md')
  const pageSize = config.themeConfig?.pagination?.pageSize
  check(Number.isInteger(pageSize) && pageSize > 0, 'themeConfig.pagination.pageSize must be a positive integer')

  for (const headEntry of config.head || []) {
    const attributes = headEntry?.[1] || {}
    const localUrl = attributes.href || attributes.src || (attributes.name === 'msapplication-TileImage' ? attributes.content : '')
    if (!localUrl || /^(?:[a-z]+:)?\/\//i.test(localUrl) || localUrl.startsWith('data:')) continue
    check(localUrl.startsWith(SITE_BASE), `Head URL must use ${SITE_BASE}: ${localUrl}`)
    const relativePath = localUrl.slice(SITE_BASE.length).split(/[?#]/, 1)[0]
    await requireNonEmptyFile(path.posix.join('src/public', relativePath))
  }
  check(!JSON.stringify(config.head).includes('safari-pinned-tab.svg'), 'Head must not reference the missing safari-pinned-tab.svg')

  const postFiles = (await readdir(POSTS_DIR)).filter(file => file.endsWith('.md')).sort()
  check(postFiles.length === EXPECTED_POST_COUNT, `Expected ${EXPECTED_POST_COUNT} posts; found ${postFiles.length}`)
  for (const fileName of postFiles) {
    const source = await readFile(path.join(POSTS_DIR, fileName), 'utf8')
    parsePostFrontmatter(source, fileName)
    for (const reference of extractLocalImagePaths(source)) {
      await checkPublicReference(reference, fileName)
    }

    const slug = path.basename(fileName, '.md')
    const route = `/posts/${slug}.html`
    const collisionKey = route.normalize('NFC').toLocaleLowerCase('en-US')
    check(!routeKeys.has(collisionKey), `${fileName}: route collides with ${routeKeys.get(collisionKey)}`)
    routeKeys.set(collisionKey, fileName)
    check(decodeURIComponent(encodeURIComponent(slug)) === slug, `${fileName}: slug cannot round-trip through URL encoding`)
  }

  const totalPages = Math.ceil(postFiles.length / pageSize)
  check(totalPages === 11, `Expected 11 pagination pages for the migration snapshot; found ${totalPages}`)
  const pageTemplate = await readFile(path.join(SOURCE_DIR, 'page', '[page].md'), 'utf8')
  const tagsIndex = await readFile(path.join(SOURCE_DIR, 'tags', 'index.md'), 'utf8')
  check(frontmatterLayout(pageTemplate) === 'home', 'src/page/[page].md must use layout: home')
  check(frontmatterLayout(tagsIndex) === 'tags', 'src/tags/index.md must use layout: tags')
  check(pageTemplate.includes('<!-- @content -->'), 'pagination template must inject generated frontmatter with @content')
  await requireNonEmptyFile('src/page/[page].paths.js')
  check(tags.size === EXPECTED_TAG_COUNT, `Expected ${EXPECTED_TAG_COUNT} distinct tags; found ${tags.size}`)
  const encodedTags = [...tags].map(tag => encodeURIComponent(tag))
  check(new Set(encodedTags).size === tags.size, 'Two tags map to the same encoded query value')

  const pagePathsModule = await import(pathToFileURL(path.join(SOURCE_DIR, 'page', '[page].paths.js')))
  const generatedPages = pagePathsModule.default?.paths?.() || []
  const expectedPageParams = Array.from({ length: totalPages - 1 }, (_, index) => String(index + 2))
  check(
    JSON.stringify(generatedPages.map(entry => entry.params?.page)) === JSON.stringify(expectedPageParams),
    `Pagination paths must be exactly ${expectedPageParams.join(', ')}`
  )
  for (const entry of generatedPages) {
    check(typeof entry.params?.page === 'string' && /^\d+$/.test(entry.params.page), 'Pagination params.page must be a decimal string')
    check(
      String(entry.content || '').split(/\r?\n/).some(line => line.trim() === `page: ${entry.params?.page}`),
      `Pagination content must match page ${entry.params?.page}`
    )
    check(!/^layout:/m.test(entry.content || ''), `Pagination page ${entry.params?.page} must inherit layout from its template`)
  }

  const tagLink = await readFile(path.join(SOURCE_DIR, '.vitepress/theme/utils.js'), 'utf8')
  check(tagLink.includes('?tag=${encodeURIComponent(tag)}'), 'Tag links must preserve exact case in a query parameter')

  const homeView = await readFile(path.join(SOURCE_DIR, '.vitepress/theme/components/HomeView.vue'), 'utf8')
  check(/pageSize\s*=\s*computed\(\(\)\s*=>[\s\S]*?\|\|\s*5\b/.test(homeView), 'HomeView pagination fallback must match config value 5')
  check(homeView.includes('`/page/${currentPage.value}.html`'), 'Pagination navigation must use deployable .html URLs')

  for (const requiredPath of [
    'src/public/favicon.ico',
    'src/public/face.png',
    'src/public/manifest.json',
    'src/public/icons/192.png',
    'src/public/icons/512.png'
  ]) {
    await requireNonEmptyFile(requiredPath)
  }
  const publicFiles = await walkFiles(PUBLIC_DIR)
  check(publicFiles.length >= 87, `Expected at least 87 migrated public files; found ${publicFiles.length}`)
  const publicKeys = new Map()
  for (const filePath of publicFiles) {
    const relativePath = path.relative(PUBLIC_DIR, filePath).split(path.sep).join('/')
    const key = relativePath.normalize('NFC').toLocaleLowerCase('en-US')
    check(!publicKeys.has(key), `Public path collides with ${publicKeys.get(key)}: ${relativePath}`)
    publicKeys.set(key, relativePath)
  }

  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'manifest.json'), 'utf8'))
  } catch (error) {
    errors.push(`src/public/manifest.json is invalid JSON: ${error.message}`)
  }
  for (const reference of [manifest?.start_url, ...(manifest?.icons || []).map(icon => icon.src)]) {
    if (typeof reference !== 'string') continue
    const resolved = new URL(reference, `https://shaofeizi.github.io${SITE_BASE}manifest.json`)
    check(resolved.pathname.startsWith(SITE_BASE), `Manifest URL points outside ${SITE_BASE}: ${reference}`)
    const relativePath = resolved.pathname.slice(SITE_BASE.length)
    if (relativePath !== 'index.html') {
      await requireNonEmptyFile(path.posix.join('src/public', relativePath))
    }
  }

  const syntaxFiles = [
    'src/.vitepress/config.mjs',
    'src/.vitepress/posts.data.mjs',
    'src/.vitepress/content-files.mjs',
    'src/page/[page].paths.js',
    'scripts/check-source.mjs',
    'scripts/verify-build.mjs',
    ...(await walkFiles(path.join(SOURCE_DIR, '.vitepress/theme'))).filter(file => file.endsWith('.js')).map(file => path.relative(PROJECT_ROOT, file))
  ]
  for (const relativePath of syntaxFiles) {
    try {
      execFileSync(process.execPath, ['--check', path.join(PROJECT_ROOT, relativePath)], { stdio: 'pipe' })
    } catch (error) {
      errors.push(`${relativePath}: JavaScript syntax check failed: ${String(error.stderr || error.message).trim()}`)
    }
  }

  if (errors.length > 0) {
    console.error(`Source verification failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`Source verification passed: ${postFiles.length} posts, ${totalPages} pages, ${tags.size} exact tags, ${publicFiles.length} public files.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
