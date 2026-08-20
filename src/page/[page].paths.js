import { readSortedPostRoutes } from '../.vitepress/content-files.mjs'

const pageSize = 5

export default {
  paths() {
    const totalPages = Math.ceil(readSortedPostRoutes().length / pageSize)
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => {
      const page = index + 2
      return {
        params: { page: String(page) },
        content: `page: ${page}\ntitle: ${JSON.stringify(`第 ${page} 页`)}`
      }
    })
  }
}
