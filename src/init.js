import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { deriveAutoloaderSuffix } from './config.js'
import { log } from './log.js'

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'vendor-prefixed', '.git', 'dist'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(full)
    } else {
      yield full
    }
  }
}

function pascal(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function constantCase(slug) {
  return slug.replace(/-/g, '_').toUpperCase()
}

/**
 * One-time template initializer: rewrites the __PLACEHOLDER__ tokens across
 * the freshly-templated repo, sets the GitHub homepage to the canonical
 * plugin page, and prints the manual wiring checklist.
 */
export async function init(root, args) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const slug =
    args.slug ?? (await rl.question('Plugin slug (e.g. my-plugin-for-elementor): ')).trim()
  const name = args.name ?? (await rl.question('Display name (e.g. Arts My Plugin): ')).trim()
  rl.close()

  if (!/^[a-z][a-z0-9-]+$/.test(slug)) {
    throw new Error(`"${slug}" is not a valid wp.org slug`)
  }
  if (!name) {
    throw new Error('Display name is required')
  }

  const replacements = {
    __SLUG__: slug,
    __NAME__: name,
    __NAMESPACE__: pascal(slug).replace(/ForElementor$/, ''),
    __VERSION_CONSTANT__: `ARTS_${constantCase(slug)}_VERSION`,
    __DEFINE_KEY__: `__ARTS_${constantCase(slug)}_VERSION__`,
    __AUTOLOADER_SUFFIX__: deriveAutoloaderSuffix(slug)
  }

  let touched = 0
  for (const file of walk(root)) {
    const original = readFileSync(file, 'utf8')
    let content = original
    for (const [token, value] of Object.entries(replacements)) {
      content = content.replaceAll(token, value)
    }
    if (content !== original) {
      writeFileSync(file, content)
      touched++
    }
    // Files named after the slug placeholder get renamed too
    if (path.basename(file).includes('__SLUG__')) {
      const renamed = path.join(path.dirname(file), path.basename(file).replaceAll('__SLUG__', slug))
      execSync(`git mv ${JSON.stringify(file)} ${JSON.stringify(renamed)}`, { cwd: root })
    }
  }
  log.success(`Placeholders rewritten in ${touched} file(s)`)

  try {
    execSync(`gh repo edit --homepage "https://artemsemkin.com/plugins/${slug}/"`, { cwd: root })
    log.success('GitHub homepage set to the canonical plugin page')
  } catch {
    log.warn('Could not set the GitHub homepage (no gh / no repo yet) — set it manually')
  }

  log.info('Manual wiring checklist:')
  log.info('  1. Register a Pi runner: scripts/provision-runner.sh in wordpress-plugin-workflows')
  log.info('  2. After wp.org approval: rotate-svn-secrets.sh --add ' + slug)
  log.info('  3. gh secret set CODECOV_TOKEN (when enabling coverage upload)')
  log.info('  4. gh secret set CLAUDE_CODE_OAUTH_TOKEN (for the Claude workflows)')
  log.info('  5. Enable the Renovate app for this repo (after CI is green)')
}
