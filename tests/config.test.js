import { describe, expect, it } from 'vitest'
import { deriveAutoloaderSuffix, deriveLicenseBanner, validateConfig } from '../src/config.js'

function minimal() {
  return {
    slug: 'test-plugin',
    versionConstant: 'ARTS_TEST_PLUGIN_VERSION',
    defineKey: '__ARTS_TEST_VERSION__',
    esbuildTarget: 'es2022',
    entry: { ts: './src/ts/boot.ts', sass: './src/styles/index.scss' },
    bundles: [],
    bannerLines: [],
    zip: { budgetMb: 0.5 },
    paths: { php: './src/php', plugin: './src/wordpress-plugin', dist: './dist' },
    devTarget: null,
    vendor: { autoloaderOnly: true, autoloaderSuffix: null },
    blueprint: null
  }
}

describe('validateConfig', () => {
  it('accepts an externals map and defaults it to empty', () => {
    expect(validateConfig({ ...minimal(), externals: { react: 'React' } }).externals).toEqual({
      react: 'React'
    })
    expect(validateConfig(minimal()).externals).toEqual({})
  })

  it('rejects externals that are not a specifier→global map', () => {
    expect(() => validateConfig({ ...minimal(), externals: ['react'] })).toThrow(/externals/)
    expect(() => validateConfig({ ...minimal(), externals: { react: '' } })).toThrow(/externals/)
  })

  it('accepts a minimal valid config', () => {
    expect(() => validateConfig(minimal())).not.toThrow()
  })

  it('rejects unknown top-level keys — every key must be read by the build', () => {
    const config = { ...minimal(), extra: true }
    expect(() => validateConfig(config)).toThrow(/unknown config key "extra"/i)
  })

  it('rejects a missing slug', () => {
    const config = minimal()
    delete config.slug
    expect(() => validateConfig(config)).toThrow(/"slug"/)
  })

  it('rejects a missing defineKey', () => {
    const config = minimal()
    delete config.defineKey
    expect(() => validateConfig(config)).toThrow(/"defineKey"/)
  })

  it('requires entry.ts, allows entry.sass to be null', () => {
    const noTs = minimal()
    noTs.entry = { ts: undefined, sass: null }
    expect(() => validateConfig(noTs)).toThrow(/"entry\.ts"/)

    const nullSass = minimal()
    nullSass.entry.sass = null
    expect(() => validateConfig(nullSass)).not.toThrow()
  })

  it('validates bundles: name and entry required, defaults applied', () => {
    const config = minimal()
    config.bundles = [{ name: 'gate', entry: './src/ts/gate.ts' }]
    const resolved = validateConfig(config)
    expect(resolved.bundles[0]).toMatchObject({
      name: 'gate',
      entry: './src/ts/gate.ts',
      outFile: 'gate.js',
      watch: true,
      sourcemap: false,
      banner: 'plugin'
    })
  })

  it('rejects a bundle without a name', () => {
    const config = minimal()
    config.bundles = [{ entry: './src/ts/gate.ts' }]
    expect(() => validateConfig(config)).toThrow(/bundle/i)
  })

  it('rejects an invalid bundle banner mode', () => {
    const config = minimal()
    config.bundles = [{ name: 'x', entry: './x.ts', banner: 'nope' }]
    expect(() => validateConfig(config)).toThrow(/banner/i)
  })

  it('accepts a bundle with custom outFile (horizontal-scroll editor/polyfill pattern)', () => {
    const config = minimal()
    config.bundles = [
      {
        name: 'polyfill',
        entry: './vendor/pf/index.js',
        outFile: 'test-plugin-scroll-timeline.js',
        watch: false,
        banner: 'license'
      }
    ]
    const resolved = validateConfig(config)
    expect(resolved.bundles[0].outFile).toBe('test-plugin-scroll-timeline.js')
    expect(resolved.bundles[0].watch).toBe(false)
  })

  it('validates blueprint block shape when present', () => {
    const config = minimal()
    config.blueprint = { seed: './dev/seed/demo-page.php', landing: 'front', extraPlugins: [] }
    expect(() => validateConfig(config)).not.toThrow()

    config.blueprint = { seed: './dev/seed/demo-page.php', landing: 'sideways', extraPlugins: [] }
    expect(() => validateConfig(config)).toThrow(/landing/)
  })

  it('rejects devTarget that is neither string nor null', () => {
    const config = minimal()
    config.devTarget = 42
    expect(() => validateConfig(config)).toThrow(/devTarget/)
  })
})

describe('deriveAutoloaderSuffix', () => {
  it('derives PascalCase suffix from the slug so sibling plugins never collide', () => {
    expect(deriveAutoloaderSuffix('cursor-follower-for-elementor')).toBe(
      'CursorFollowerForElementorPlugin'
    )
    expect(deriveAutoloaderSuffix('horizontal-scroll-for-elementor')).toBe(
      'HorizontalScrollForElementorPlugin'
    )
  })
})

describe('deriveLicenseBanner', () => {
  it('builds a third-party banner from a package.json object', () => {
    const banner = deriveLicenseBanner({
      name: '@arts/scroll-timeline-polyfill',
      version: '1.0.1',
      license: 'Apache-2.0',
      homepage: 'https://github.com/artkrsk/arts-scroll-timeline-polyfill'
    })
    expect(banner).toBe(
      '/*! @arts/scroll-timeline-polyfill v1.0.1 | License: Apache-2.0 | https://github.com/artkrsk/arts-scroll-timeline-polyfill */'
    )
  })

  it('falls back to a cleaned repository.url when homepage is absent', () => {
    const banner = deriveLicenseBanner({
      name: 'x',
      version: '1.0.0',
      license: 'MIT',
      repository: { url: 'git+https://github.com/a/b.git' }
    })
    expect(banner).toContain('https://github.com/a/b')
    expect(banner).not.toContain('git+')
  })
})
