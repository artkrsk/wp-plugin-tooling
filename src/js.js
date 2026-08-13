import { build, context } from 'esbuild'
import { log } from './log.js'

// Plain IIFE, no globalName: the bundles are pure side-effect scripts.
// Banner goes through esbuild's own option so sourcemaps stay line-accurate.
// Secondary bundles override entry/banner/sourcemap — e.g. a gate bundle's
// output is inlined into HTML by PHP, where a banner is per-page weight and a
// sourceMappingURL comment would 404 against the page URL.
function options(ctx, { dev, outfile, entry, banner, sourcemap }) {
  return {
    entryPoints: [entry ?? ctx.paths.tsEntry],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ctx.config.esbuildTarget,
    // Vite parity for the plugin bundle: DEV guards live in dev builds and
    // are dropped from production output (also matches ?. chains).
    define: {
      'import.meta.env.DEV': dev ? 'true' : 'false',
      [ctx.config.defineKey]: JSON.stringify(ctx.version)
    },
    minify: !dev,
    sourcemap: sourcemap ?? (dev ? 'linked' : false),
    banner: { js: banner ?? ctx.banner },
    logLevel: 'warning'
  }
}

export async function buildJs(ctx, opts) {
  await build(options(ctx, opts))
  log.success(`JS compiled: ${opts.outfile}`)
}

export async function watchJs(ctx, outfile, extra = {}) {
  let resolveFirst
  const firstBuild = new Promise((resolve) => {
    resolveFirst = resolve
  })
  const c = await context({
    ...options(ctx, { dev: true, outfile, ...extra }),
    plugins: [
      {
        name: 'notify',
        setup(b) {
          b.onEnd((result) => {
            if (result.errors.length > 0) return
            log.success(`JS compiled: ${outfile}`)
            resolveFirst()
          })
        }
      }
    ]
  })
  await c.watch()
  return { dispose: () => c.dispose(), firstBuild }
}

/** Per-bundle esbuild overrides derived from the resolved bundle config. */
export function bundleOverrides(bundle) {
  return {
    entry: bundle.entryAbs,
    // bannerText: '' = none, string = license banner, null = plugin banner (options default)
    ...(bundle.bannerText !== null ? { banner: bundle.bannerText } : {}),
    // sourcemap false = never; true = dev-linked/prod-none (options default)
    ...(bundle.sourcemap ? {} : { sourcemap: false })
  }
}
