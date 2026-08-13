import path from 'node:path'
import process from 'node:process'

/**
 * Shared Vitest shape for Arts plugin repos.
 *
 * - `node` environment by default; DOM tests opt in per-file with a
 *   `// @vitest-environment happy-dom` docblock (jsdom lacks matchMedia/RO/IO).
 * - `@ts` alias is TEST-ONLY (repos enforce this with an alias-boundary test).
 * - Coverage provider is v8: since Vitest 3.2 it AST-remaps into
 *   istanbul-format coverage-final.json, which fallow's `--coverage` reads
 *   (verified 2026-08-13 on cursor-follower — v8 matched one more function
 *   than the istanbul provider did).
 *
 * Usage in a repo's vitest.config.ts:
 *   import { defineConfig } from 'vitest/config'
 *   import { createVitestConfig } from '@arts/wp-plugin-tooling/vitest'
 *   export default defineConfig(createVitestConfig({ defineKey: '__ARTS_X_VERSION__' }))
 */
export function createVitestConfig({ defineKey, setupFiles = ['tests/setup.ts'] } = {}) {
  return {
    ...(defineKey ? { define: { [defineKey]: JSON.stringify('0.0.0-test') } } : {}),
    resolve: {
      alias: { '@ts': path.resolve(process.cwd(), 'src/ts') }
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      // A fresh template repo has no tests yet — the suite gate starts passing
      // and tightens itself the moment the first test lands.
      passWithNoTests: true,
      setupFiles,
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'istanbul',
        include: ['src/ts/**/*.ts'],
        exclude: [
          'src/ts/**/*.d.ts',
          'src/ts/interfaces/**',
          'src/ts/types/**',
          'src/ts/index.ts'
        ],
        reporter: ['text', 'html', 'json']
      }
    }
  }
}
