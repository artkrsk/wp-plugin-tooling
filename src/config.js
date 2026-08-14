import './env.js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const KNOWN = {
  top: [
    'slug',
    'versionConstant',
    'defineKey',
    'esbuildTarget',
    'entry',
    'bundles',
    'bannerLines',
    'zip',
    'paths',
    'devTarget',
    'vendor',
    'blueprint',
    'externals'
  ],
  entry: ['ts', 'sass'],
  paths: ['php', 'plugin', 'dist'],
  vendor: ['autoloaderOnly', 'autoloaderSuffix'],
  zip: ['budgetMb'],
  blueprint: ['seed', 'landing', 'extraPlugins'],
  bundle: ['name', 'entry', 'outFile', 'watch', 'sourcemap', 'banner']
}

const BANNER_MODES = ['plugin', 'none', 'license']
const LANDING_MODES = ['editor', 'front']

function assertKeys(obj, known, scope) {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      throw new Error(
        `Unknown config key "${scope}${key}" — remove it (every key must be read by the build)`
      )
    }
  }
}

/** Validate a raw project.config.js object; returns it with bundle defaults applied. */
export function validateConfig(config) {
  assertKeys(config, KNOWN.top, '')
  assertKeys(config.entry ?? {}, KNOWN.entry, 'entry.')
  assertKeys(config.paths ?? {}, KNOWN.paths, 'paths.')
  assertKeys(config.vendor ?? {}, KNOWN.vendor, 'vendor.')
  assertKeys(config.zip ?? {}, KNOWN.zip, 'zip.')

  for (const key of ['slug', 'versionConstant', 'defineKey', 'esbuildTarget']) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      throw new Error(`Missing required config key "${key}"`)
    }
  }
  if (typeof config.entry?.ts !== 'string') {
    throw new Error('Missing required config key "entry.ts"')
  }
  if (config.entry.sass !== null && typeof config.entry.sass !== 'string') {
    throw new Error('"entry.sass" must be a path string or null')
  }
  for (const key of ['php', 'plugin', 'dist']) {
    if (typeof config.paths?.[key] !== 'string') {
      throw new Error(`Missing required config key "paths.${key}"`)
    }
  }
  if (config.devTarget !== null && typeof config.devTarget !== 'string') {
    throw new Error('"devTarget" must be a path string or null')
  }
  if (typeof config.vendor?.autoloaderOnly !== 'boolean') {
    throw new Error('Missing required config key "vendor.autoloaderOnly"')
  }
  if (config.vendor.autoloaderSuffix !== null && typeof config.vendor.autoloaderSuffix !== 'string') {
    throw new Error('"vendor.autoloaderSuffix" must be a string or null (null = derived from slug)')
  }
  if (typeof config.zip?.budgetMb !== 'number' || config.zip.budgetMb <= 0) {
    throw new Error('Missing required config key "zip.budgetMb"')
  }
  if (!Array.isArray(config.bannerLines) || config.bannerLines.some((l) => typeof l !== 'string')) {
    throw new Error('"bannerLines" must be an array of strings')
  }

  if (!Array.isArray(config.bundles)) {
    throw new Error('"bundles" must be an array (use [] for none)')
  }
  const bundles = config.bundles.map((bundle, i) => {
    assertKeys(bundle, KNOWN.bundle, `bundles[${i}].`)
    if (typeof bundle.name !== 'string' || bundle.name === '') {
      throw new Error(`Bundle at index ${i} needs a "name"`)
    }
    if (typeof bundle.entry !== 'string' || bundle.entry === '') {
      throw new Error(`Bundle "${bundle.name}" needs an "entry" path`)
    }
    const banner = bundle.banner ?? 'plugin'
    if (!BANNER_MODES.includes(banner)) {
      throw new Error(
        `Bundle "${bundle.name}" banner must be one of ${BANNER_MODES.join('|')}, got "${banner}"`
      )
    }
    return {
      name: bundle.name,
      entry: bundle.entry,
      outFile: bundle.outFile ?? `${bundle.name}.js`,
      watch: bundle.watch ?? true,
      sourcemap: bundle.sourcemap ?? false,
      banner
    }
  })

  if (config.blueprint !== null && config.blueprint !== undefined) {
    assertKeys(config.blueprint, KNOWN.blueprint, 'blueprint.')
    if (typeof config.blueprint.seed !== 'string') {
      throw new Error('Missing required config key "blueprint.seed"')
    }
    if (!LANDING_MODES.includes(config.blueprint.landing)) {
      throw new Error(`"blueprint.landing" must be one of ${LANDING_MODES.join('|')}`)
    }
    if (!Array.isArray(config.blueprint.extraPlugins)) {
      throw new Error('"blueprint.extraPlugins" must be an array of wp.org slugs')
    }
  }

  if (config.externals !== undefined) {
    const bad =
      typeof config.externals !== 'object' ||
      config.externals === null ||
      Array.isArray(config.externals) ||
      Object.entries(config.externals).some(
        ([k, v]) => typeof v !== 'string' || v === '' || k === ''
      )
    if (bad) {
      throw new Error(
        '"externals" must map import specifiers to global expressions, e.g. { react: \'React\', \'@wordpress/element\': \'wp.element\' }'
      )
    }
  }

  return { ...config, bundles, blueprint: config.blueprint ?? null, externals: config.externals ?? {} }
}

/** Autoloader class suffix derived from the slug so sibling plugins never collide. */
export function deriveAutoloaderSuffix(slug) {
  return `${slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}Plugin`
}

/** Third-party bundle banner from its package.json — upstream identity, never restated by hand. */
export function deriveLicenseBanner(pkg) {
  const homepage = pkg.homepage ?? (pkg.repository?.url ?? '').replace(/^git\+|\.git$/g, '')
  return `/*! ${pkg.name} v${pkg.version} | License: ${pkg.license} | ${homepage} */`
}

function resolveLicenseBanner(entryAbs) {
  let dir = path.dirname(entryAbs)
  while (dir !== path.dirname(dir) && !existsSync(path.join(dir, 'package.json'))) {
    dir = path.dirname(dir)
  }
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  return deriveLicenseBanner(pkg)
}

export async function loadCtx() {
  const root = process.cwd()
  // Note: this module import is cached by Node — project.config.js edits need a dev restart.
  // composer.json below is read fresh on every call (the composer watcher relies on that).
  const raw = (await import(pathToFileURL(path.join(root, 'project.config.js')).href)).default
  const config = validateConfig(raw)

  const composer = JSON.parse(readFileSync(path.join(root, 'composer.json'), 'utf8'))
  if (!composer.version) {
    throw new Error('composer.json needs a "version" field — it is the single version source')
  }

  const author = composer.authors?.[0] ?? {}
  const header = {
    'Plugin Name': '',
    Description: composer.description ?? '',
    Version: composer.version,
    Author: author.name ?? '',
    'Author URI': author.homepage ?? '',
    'Plugin URI': composer.homepage ?? '',
    License: composer.license ?? '',
    ...composer.wordpress,
    ...composer.plugin
  }
  if (!header['Plugin Name']) {
    throw new Error('composer.json plugin["Plugin Name"] is required (display name source)')
  }

  const banner = [
    '/*!',
    ` * ${header['Plugin Name']} v${composer.version}`,
    ` * © ${new Date().getFullYear()} ${header.Author}`.trimEnd(),
    ` * License: ${header.License}`,
    ` * ${header['Plugin URI']}`.trimEnd(),
    // trimEnd: an empty bannerLines entry is a ' *' separator line, no trailing space
    ...config.bannerLines.map((line) => ` * ${line}`.trimEnd()),
    ' */'
  ].join('\n')

  const abs = (p) => path.resolve(root, p)
  const php = abs(config.paths.php)
  const plugin = abs(config.paths.plugin)
  const dist = abs(config.paths.dist)
  const libraryDir = path.join(php, 'libraries', config.slug)

  const bundles = config.bundles.map((bundle) => {
    const entryAbs = abs(bundle.entry)
    return {
      ...bundle,
      entryAbs,
      out: path.join(libraryDir, bundle.outFile),
      bannerText:
        bundle.banner === 'none' ? '' : bundle.banner === 'license' ? resolveLicenseBanner(entryAbs) : null // null = plugin banner (esbuild default in js.js)
    }
  })

  return Object.freeze({
    root,
    config,
    composer,
    version: composer.version,
    header,
    banner,
    bundles,
    paths: Object.freeze({
      php,
      plugin,
      dist,
      libraryDir,
      tsEntry: abs(config.entry.ts),
      sassEntry: config.entry.sass ? abs(config.entry.sass) : null,
      jsOut: path.join(libraryDir, `${config.slug}.js`),
      cssOut: path.join(libraryDir, `${config.slug}.css`),
      mainFile: path.join(plugin, `${config.slug}.php`),
      readme: path.join(plugin, 'readme.txt'),
      composerJson: path.join(root, 'composer.json'),
      composerLock: path.join(root, 'composer.lock'),
      packageJson: path.join(root, 'package.json'),
      vendor: path.join(root, 'vendor'),
      vendorPrefixed: path.join(root, 'vendor-prefixed'),
      staging: path.join(dist, config.slug),
      zip: path.join(dist, `${config.slug}.zip`),
      devTarget: config.devTarget ? abs(config.devTarget) : null,
      blueprintSeed: config.blueprint ? abs(config.blueprint.seed) : null,
      blueprintOut: path.join(root, '.wordpress-org/blueprints/blueprint.json')
    })
  })
}
