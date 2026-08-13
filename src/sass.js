import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { watch } from 'chokidar'
import { compile } from 'sass'
import { log } from './log.js'

// Modern API only: `style` + `loadPaths` (the legacy outputStyle/includePaths names are
// silently ignored by compile()). Dev skips the banner so the sourcemap stays line-accurate.
export function buildCss(ctx, { dev, outfile }) {
  if (!ctx.paths.sassEntry) return
  const result = compile(ctx.paths.sassEntry, {
    style: dev ? 'expanded' : 'compressed',
    sourceMap: dev,
    loadPaths: ['node_modules']
  })
  mkdirSync(path.dirname(outfile), { recursive: true })
  if (dev && result.sourceMap) {
    writeFileSync(outfile, `${result.css}\n/*# sourceMappingURL=${path.basename(outfile)}.map */`)
    writeFileSync(`${outfile}.map`, JSON.stringify(result.sourceMap))
  } else {
    writeFileSync(outfile, `${ctx.banner}\n${result.css}`)
  }
  log.success(`CSS compiled: ${outfile}`)
}

export function watchCss(ctx, outfile) {
  if (!ctx.paths.sassEntry) return null
  const watcher = watch(path.dirname(ctx.paths.sassEntry), { ignoreInitial: true })
  watcher.on('all', () => {
    try {
      buildCss(ctx, { dev: true, outfile })
    } catch (err) {
      log.error('CSS rebuild failed', err)
    }
  })
  return watcher
}
