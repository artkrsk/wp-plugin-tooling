import process from 'node:process'
import { buildJs, bundleOverrides, watchJs } from './js.js'
import { log } from './log.js'
import { stampAll } from './meta.js'
import { buildCss, watchCss } from './sass.js'
import { initialMirror, watchComposer, watchSources } from './sync.js'

export async function dev(ctx) {
  // DEV_TARGET is optional. Without it, dev mode only compiles into
  // src/php/libraries/ — composer-symlink consumers (e.g. velum-core) run
  // their own sync pipeline over that directory.
  const syncing = Boolean(ctx.paths.devTarget)
  if (!syncing) {
    log.info('No DEV_TARGET — building without sync (composer-symlink workflow)')
  }
  stampAll(ctx)

  const js = await watchJs(ctx, ctx.paths.jsOut)
  const watched = []
  for (const bundle of ctx.bundles) {
    if (bundle.watch) {
      watched.push(await watchJs(ctx, bundle.out, bundleOverrides(bundle)))
    } else {
      // A non-watched bundle never changes during dev (e.g. a vendored
      // polyfill) — one minified build, no watcher, no .map.
      await buildJs(ctx, { dev: false, outfile: bundle.out, ...bundleOverrides(bundle) })
    }
  }
  buildCss(ctx, { dev: true, outfile: ctx.paths.cssOut })
  await Promise.all([js.firstBuild, ...watched.map((w) => w.firstBuild)])

  if (syncing) {
    initialMirror(ctx)
  }
  const watchers = [
    syncing ? watchSources(ctx) : null,
    watchCss(ctx, ctx.paths.cssOut),
    syncing ? watchComposer(ctx) : null
  ].filter(Boolean)

  log.success('Dev mode running — Ctrl+C to stop')
  process.on('SIGINT', async () => {
    log.info('Shutting down…')
    await js.dispose()
    await Promise.all(watched.map((w) => w.dispose()))
    await Promise.all(watchers.map((w) => w.close()))
    process.exit(0)
  })
}
