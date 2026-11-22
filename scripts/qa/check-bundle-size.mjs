import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const assetsDir = resolve(projectRoot, 'dist/assets')
const files = await readdir(assetsDir, { withFileTypes: true })
const assetFiles = files.filter((file) => file.isFile() && /\.(js|css)$/.test(file.name))
if (!assetFiles.length) throw new Error('No built JavaScript or CSS assets found. Run the production build first.')

const sizes = { js: 0, css: 0 }
for (const file of assetFiles) {
  const type = file.name.endsWith('.js') ? 'js' : 'css'
  sizes[type] += gzipSync(await readFile(resolve(assetsDir, file.name))).byteLength
}

const budgets = { js: 250 * 1024, css: 50 * 1024 }
for (const type of ['js', 'css']) {
  const kb = (sizes[type] / 1024).toFixed(1)
  const budgetKb = (budgets[type] / 1024).toFixed(0)
  console.log(`${type.toUpperCase()} gzip: ${kb} KiB / ${budgetKb} KiB budget`)
  if (sizes[type] > budgets[type]) throw new Error(`${type.toUpperCase()} gzip bundle exceeds its checked-in performance budget.`)
}
