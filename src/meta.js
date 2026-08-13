import { readFileSync, writeFileSync } from 'node:fs'
import { log } from './log.js'

export function stampAll(ctx) {
  stampMainFile(ctx)
  stampReadme(ctx)
  stampPackageJson(ctx)
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Replace-only-if-present: the header layout (incl. the hand-maintained "Requires Plugins"
// line position) stays deliberate; a value with no line to land on is a warning, not an insert.
function replaceHeaderLine(block, label, value) {
  const pattern = new RegExp(`^([ \\t*]*${escapeRegex(label)}:)[ \\t]*.*$`, 'm')
  if (!pattern.test(block)) {
    log.warn(`Plugin header has no "${label}:" line — add it manually if it should ship`)
    return block
  }
  return block.replace(pattern, (_, prefix) => `${prefix} ${value}`)
}

function stampMainFile(ctx) {
  const original = readFileSync(ctx.paths.mainFile, 'utf8')
  const headerMatch = original.match(/\/\*\*[\s\S]*?\*\//)
  if (!headerMatch) throw new Error(`No plugin header docblock in ${ctx.paths.mainFile}`)

  let header = headerMatch[0]
  for (const [field, value] of Object.entries(ctx.header)) {
    if (field === 'Requires Plugins' || value === undefined || value === '') continue
    header = replaceHeaderLine(header, field, value)
  }

  let content = original.replace(headerMatch[0], () => header)

  const constant = new RegExp(
    `(define\\(\\s*'${escapeRegex(ctx.config.versionConstant)}'\\s*,\\s*')[^']*('\\s*\\))`
  )
  if (constant.test(content)) {
    content = content.replace(constant, `$1${ctx.version}$2`)
  } else {
    log.warn(`No define( '${ctx.config.versionConstant}', … ) found in main file`)
  }

  if (content !== original) writeFileSync(ctx.paths.mainFile, content)
  log.success(`Stamped ${ctx.config.slug}.php (v${ctx.version})`)
}

function stampReadme(ctx) {
  const original = readFileSync(ctx.paths.readme, 'utf8')
  let content = original.replace(/^=== .+ ===$/m, `=== ${ctx.header['Plugin Name']} ===`)

  const fields = {
    'Stable tag': ctx.version,
    'Requires at least': ctx.header['Requires at least'],
    'Tested up to': ctx.header['Tested up to'],
    'Requires PHP': ctx.header['Requires PHP'],
    License: ctx.header.License,
    'License URI': ctx.header['License URI']
  }
  for (const [label, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue
    const pattern = new RegExp(`^${escapeRegex(label)}:.*$`, 'm')
    if (pattern.test(content)) {
      content = content.replace(pattern, `${label}: ${value}`)
    } else {
      log.warn(`readme.txt has no "${label}:" line`)
    }
  }

  if (content !== original) writeFileSync(ctx.paths.readme, content)
  log.success('Stamped readme.txt')
}

function stampPackageJson(ctx) {
  const pkg = JSON.parse(readFileSync(ctx.paths.packageJson, 'utf8'))
  if (pkg.version === ctx.version) return
  pkg.version = ctx.version
  writeFileSync(ctx.paths.packageJson, `${JSON.stringify(pkg, null, 2)}\n`)
  log.success(`Stamped package.json version → ${ctx.version}`)
}
