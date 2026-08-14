import { build, context } from 'esbuild'
import { log } from './log.js'

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Maps import specifiers to host-provided globals (config.externals) — the
// WordPress-React pattern, where bundling react inline would load a second
// copy next to wp-admin's and break hooks state. esbuild's own `external`
// can't do this in an IIFE (it leaves a require() no browser has), so each
// mapped specifier resolves to a one-line module reading the global instead.
function globalExternalsPlugin(map) {
  const filter = new RegExp(`^(${Object.keys(map).map(escapeRegex).join('|')})$`)
  return {
    name: 'global-externals',
    setup(b) {
      b.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'global-external' }))
      b.onLoad({ filter: /.*/, namespace: 'global-external' }, (args) => ({
        contents: `module.exports = ${map[args.path]}`,
        loader: 'js'
      }))
    }
  }
}

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
    logLevel: 'warning',
    ...(Object.keys(ctx.config.externals ?? {}).length > 0
      ? { plugins: [globalExternalsPlugin(ctx.config.externals)] }
      : {})
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
