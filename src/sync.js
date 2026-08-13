import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { watch } from 'chokidar'
import { loadCtx } from './config.js'
import { log } from './log.js'
import { stampAll } from './meta.js'

const notHidden = (src) => !path.basename(src).startsWith('.')

function targetFor(ctx, absSrc) {
  const t = ctx.paths.devTarget
  if (absSrc.startsWith(ctx.paths.php + path.sep)) {
    return path.join(t, 'src/php', path.relative(ctx.paths.php, absSrc))
  }
  if (absSrc.startsWith(ctx.paths.plugin + path.sep)) {
    return path.join(t, path.relative(ctx.paths.plugin, absSrc))
  }
  if (absSrc.startsWith(ctx.paths.vendorPrefixed + path.sep)) {
    return path.join(t, 'vendor-prefixed', path.relative(ctx.paths.vendorPrefixed, absSrc))
  }
  return null
}

export function initialMirror(ctx) {
  const t = ctx.paths.devTarget
  mkdirSync(t, { recursive: true })
  // Scope-clean src/php so deletions from previous sessions don't linger; vendor dirs are NOT wiped
  rmSync(path.join(t, 'src/php'), { recursive: true, force: true })
  cpSync(ctx.paths.php, path.join(t, 'src/php'), { recursive: true, filter: notHidden })
  cpSync(ctx.paths.plugin, t, { recursive: true, filter: notHidden })
  syncVendors(ctx)
  copyFileSync(ctx.paths.composerJson, path.join(t, 'composer.json'))
  if (existsSync(ctx.paths.composerLock)) {
    copyFileSync(ctx.paths.composerLock, path.join(t, 'composer.lock'))
  }
  log.success(`Mirrored plugin → ${t}`)
}

function sameContent(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false
  return readFileSync(a, 'utf8') === readFileSync(b, 'utf8')
}

export function syncVendors(ctx) {
  const t = ctx.paths.devTarget
  const fresh =
    existsSync(path.join(t, 'vendor')) &&
    sameContent(ctx.paths.composerLock, path.join(t, 'composer.lock'))
  if (fresh) return
  log.info('Syncing vendor/ + vendor-prefixed/ (first run or composer.lock changed)…')
  rmSync(path.join(t, 'vendor'), { recursive: true, force: true })
  cpSync(ctx.paths.vendor, path.join(t, 'vendor'), { recursive: true, filter: notHidden })
  rmSync(path.join(t, 'vendor-prefixed'), { recursive: true, force: true })
  cpSync(ctx.paths.vendorPrefixed, path.join(t, 'vendor-prefixed'), {
    recursive: true,
    filter: notHidden
  })
}

// Per-file mirroring. src/php/libraries/ is deliberately included: esbuild writes fresh
// bundles there and this single mechanism mirrors them to the site.
export function watchSources(ctx) {
  const watcher = watch([ctx.paths.php, ctx.paths.plugin, ctx.paths.vendorPrefixed], {
    ignoreInitial: true,
    ignored: (p) => path.basename(p).startsWith('.'),
    // Waits out in-progress writes: dedupes macOS fsevents double-fires and, more importantly,
    // never mirrors a half-written file to the site
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 }
  })
  watcher.on('all', (event, src) => {
    const target = targetFor(ctx, src)
    if (!target) return
    try {
      if (event === 'add' || event === 'change') {
        mkdirSync(path.dirname(target), { recursive: true })
        copyFileSync(src, target)
        log.info(`→ ${path.relative(ctx.root, src)}`)
      } else if (event === 'unlink' || event === 'unlinkDir') {
        rmSync(target, { recursive: true, force: true })
        log.info(`✕ ${path.relative(ctx.root, src)}`)
      } else if (event === 'addDir') {
        mkdirSync(target, { recursive: true })
      }
    } catch (err) {
      log.error(`Sync failed: ${src}`, err)
    }
  })
  return watcher
}

export function watchComposer(ctx) {
  const watcher = watch([ctx.paths.composerJson, ctx.paths.composerLock], { ignoreInitial: true })
  watcher.on('change', async () => {
    try {
      // Fresh ctx picks up edited composer.json (read per-call); the running esbuild banner
      // keeps the old version until dev restarts — version bumps are release-time events.
      const fresh = await loadCtx()
      stampAll(fresh)
      syncVendors(fresh)
      copyFileSync(fresh.paths.composerJson, path.join(fresh.paths.devTarget, 'composer.json'))
      if (existsSync(fresh.paths.composerLock)) {
        copyFileSync(fresh.paths.composerLock, path.join(fresh.paths.devTarget, 'composer.lock'))
      }
      log.success('composer.json changed — meta restamped, mirrored')
    } catch (err) {
      log.error('composer watch handler failed', err)
    }
  })
  return watcher
}
