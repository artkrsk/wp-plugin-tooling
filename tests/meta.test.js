import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stampAll } from '../src/meta.js'

/**
 * meta.js rewrites the plugin header, readme.txt and package.json of every
 * shipped plugin, so its edge cases are the ones that silently corrupt released
 * metadata. These exercise the real file path rather than the internals —
 * stampAll is the only export, and it is what the build actually calls.
 */

let dir
let warn

const MAIN_FILE = `<?php
/**
 * Plugin Name: Old Name
 * Description: Does things.
 * Version: 0.0.1
 * Requires at least: 5.9
 * Requires PHP: 7.4
 * Requires Plugins: elementor
 * Text Domain: test-plugin
 */

define( 'ARTS_TEST_PLUGIN_VERSION', '0.0.1' );
`

const README = `=== Old Name ===
Contributors: someone
Requires at least: 5.9
Tested up to: 6.0
Requires PHP: 7.4
Stable tag: 0.0.1
License: GPLv2
License URI: https://example.test/old

== Description ==
Does things.
`

function makeCtx(overrides = {}) {
  const paths = {
    mainFile: join(dir, 'test-plugin.php'),
    readme: join(dir, 'readme.txt'),
    packageJson: join(dir, 'package.json')
  }
  writeFileSync(paths.mainFile, overrides.mainFile ?? MAIN_FILE)
  writeFileSync(paths.readme, overrides.readme ?? README)
  writeFileSync(paths.packageJson, `${JSON.stringify({ name: 'test-plugin', version: '0.0.1' }, null, 2)}\n`)

  return {
    version: '1.2.3',
    config: { slug: 'test-plugin', versionConstant: 'ARTS_TEST_PLUGIN_VERSION' },
    paths,
    header: {
      'Plugin Name': 'New Name',
      Description: 'Does better things.',
      Version: '1.2.3',
      'Requires at least': '6.0',
      'Tested up to': '7.1',
      'Requires PHP': '8.0',
      'Requires Plugins': 'elementor,woocommerce',
      License: 'GPLv3',
      'License URI': 'https://example.test/new'
    },
    ...overrides.ctx
  }
}

const read = (p) => readFileSync(p, 'utf8')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arts-meta-'))
  // Both silences the logger and lets the warning paths be asserted.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('stampAll — plugin header', () => {
  it('rewrites header fields that exist', () => {
    const ctx = makeCtx()
    stampAll(ctx)
    const php = read(ctx.paths.mainFile)

    expect(php).toContain('Plugin Name: New Name')
    expect(php).toContain('Requires at least: 6.0')
    expect(php).toContain('Requires PHP: 8.0')
  })

  it('never touches Requires Plugins — it is hand-maintained', () => {
    const ctx = makeCtx()
    stampAll(ctx)

    expect(read(ctx.paths.mainFile)).toContain('Requires Plugins: elementor\n')
    expect(read(ctx.paths.mainFile)).not.toContain('elementor,woocommerce')
  })

  it('warns instead of inserting a header line that is absent', () => {
    const ctx = makeCtx()
    // "Tested up to" is not in MAIN_FILE's docblock.
    stampAll(ctx)

    expect(read(ctx.paths.mainFile)).not.toContain('Tested up to')
    expect(warn.mock.calls.flat().join('\n')).toMatch(/no "Tested up to:" line/)
  })

  it('throws when the file has no header docblock at all', () => {
    const ctx = makeCtx({ mainFile: "<?php\n// no docblock here\n" })
    expect(() => stampAll(ctx)).toThrow(/No plugin header docblock/)
  })
})

describe('stampAll — version constant', () => {
  it('rewrites a literal define', () => {
    const ctx = makeCtx()
    stampAll(ctx)
    expect(read(ctx.paths.mainFile)).toContain("define( 'ARTS_TEST_PLUGIN_VERSION', '1.2.3' )")
  })

  it('warns and leaves the file alone when the constant is computed, not literal', () => {
    // fluid-design-system does exactly this: the constant is derived at runtime
    // from the plugin header, so there is no literal for the stamper to rewrite.
    const computed = MAIN_FILE.replace(
      "define( 'ARTS_TEST_PLUGIN_VERSION', '0.0.1' );",
      "define( 'ARTS_TEST_PLUGIN_VERSION', Utilities::get_plugin_version( __FILE__ ) );"
    )
    const ctx = makeCtx({ mainFile: computed })
    stampAll(ctx)

    const php = read(ctx.paths.mainFile)
    expect(php).toContain('Utilities::get_plugin_version( __FILE__ )')
    expect(warn.mock.calls.flat().join('\n')).toMatch(/No define\( 'ARTS_TEST_PLUGIN_VERSION'/)
  })
})

describe('stampAll — readme.txt', () => {
  it('rewrites the title and the stamped fields', () => {
    const ctx = makeCtx()
    stampAll(ctx)
    const readme = read(ctx.paths.readme)

    expect(readme).toContain('=== New Name ===')
    expect(readme).toContain('Stable tag: 1.2.3')
    expect(readme).toContain('Tested up to: 7.1')
    expect(readme).toContain('License URI: https://example.test/new')
  })

  it('is case sensitive: a lower-case "license:" line is warned about, not stamped', () => {
    // Caught in fluid-design-system, whose readme carried "license: GPLv3" and
    // silently kept a stale value until the casing was fixed.
    const ctx = makeCtx({ readme: README.replace('License: GPLv2', 'license: GPLv2') })
    stampAll(ctx)

    const readme = read(ctx.paths.readme)
    expect(readme).toContain('license: GPLv2')
    expect(warn.mock.calls.flat().join('\n')).toMatch(/no "License:" line/)
  })
})

describe('stampAll — package.json', () => {
  it('syncs the version', () => {
    const ctx = makeCtx()
    stampAll(ctx)
    expect(JSON.parse(read(ctx.paths.packageJson)).version).toBe('1.2.3')
  })

  it('leaves the file untouched when the version already matches', () => {
    const ctx = makeCtx()
    writeFileSync(ctx.paths.packageJson, '{"name":"test-plugin","version":"1.2.3","keep":true}')
    stampAll(ctx)

    // Unformatted on purpose: an unnecessary rewrite would reformat it.
    expect(read(ctx.paths.packageJson)).toBe('{"name":"test-plugin","version":"1.2.3","keep":true}')
  })
})
