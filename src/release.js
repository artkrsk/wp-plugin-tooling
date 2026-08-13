import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { validateCmd, syncCmd } from './changelog.js'
import { log } from './log.js'
import { stampAll } from './meta.js'

function bumpVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) {
    return spec
  }
  const [major, minor, patch] = current.split('.').map(Number)
  if (spec === 'patch') return `${major}.${minor}.${patch + 1}`
  if (spec === 'minor') return `${major}.${minor + 1}.0`
  if (spec === 'major') return `${major + 1}.0.0`
  throw new Error(`Unknown version spec "${spec}" — use patch | minor | major | x.y.z`)
}

/**
 * The one-command release: bump composer.json (the single version source),
 * stamp every derived file, refuse to proceed without a changelog entry,
 * regenerate CHANGELOG.md, commit and tag. Pushing the tag stays manual.
 */
export async function release(spec, loadCtx) {
  const root = process.cwd()

  const dirty = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim()
  if (dirty) {
    throw new Error('Working tree is not clean — commit or stash before releasing')
  }

  const composerPath = path.join(root, 'composer.json')
  const composer = JSON.parse(readFileSync(composerPath, 'utf8'))
  const next = bumpVersion(composer.version, spec)

  // Changelog gate BEFORE touching anything: the entry is hand-written first.
  validateCmd(root, next)

  composer.version = next
  writeFileSync(composerPath, `${JSON.stringify(composer, null, 2)}\n`)

  const ctx = await loadCtx() // fresh: reads the bumped composer.json
  stampAll(ctx)
  syncCmd(root)

  execSync(
    'git add composer.json package.json CHANGELOG.md ' +
      `${path.relative(root, ctx.paths.mainFile)} ${path.relative(root, ctx.paths.readme)}`,
    { cwd: root }
  )
  execSync(`git commit -m "Release ${next}"`, { cwd: root })
  execSync(`git tag v${next}`, { cwd: root })
  log.success(`Released ${next} — push with: git push && git push origin v${next}`)
}
