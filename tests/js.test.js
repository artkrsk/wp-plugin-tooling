import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildJs } from '../src/js.js'

/**
 * The externals mechanism is what keeps a WordPress-React plugin from bundling
 * a second React next to wp-admin's. These run the real esbuild pipeline: the
 * fixture imports 'react' WITHOUT react being installed, so resolution can only
 * succeed through the global mapping — a fake pass is impossible.
 */

let dir

function ctx(externals) {
  return {
    version: '1.0.0',
    banner: '/* test */',
    paths: { tsEntry: join(dir, 'entry.ts') },
    config: { esbuildTarget: 'es2022', defineKey: '__ARTS_TEST_VERSION__', externals }
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arts-js-'))
  writeFileSync(
    join(dir, 'entry.ts'),
    "import { createElement } from 'react'\nconsole.log(createElement('div'))\n"
  )
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('buildJs externals', () => {
  it('resolves a mapped specifier to the host global instead of node_modules', async () => {
    const out = join(dir, 'out.js')
    await buildJs(ctx({ react: 'wp.element' }), { outfile: out, dev: true })

    const js = readFileSync(out, 'utf8')
    expect(js).toContain('wp.element')
    // Nothing from a real react build — the import resolved to the one-liner.
    expect(js).not.toContain('react.development')
  })

  it('fails loudly when the specifier is not mapped and not installed', async () => {
    const out = join(dir, 'out.js')
    await expect(buildJs(ctx({}), { outfile: out, dev: true })).rejects.toThrow()
  })
})
