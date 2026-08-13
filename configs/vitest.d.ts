interface ArtsVitestOptions {
  /** esbuild define key substituted in src/ts (e.g. '__ARTS_X_VERSION__') */
  defineKey?: string
  setupFiles?: string[]
}

/**
 * The returned shape, typed precisely enough to be SPREAD and overridden — a
 * repo that needs jsdom, its own coverage excludes or thresholds has to be able
 * to reach into `.test` and `.test.coverage` without the whole thing collapsing
 * to `unknown`. Literal types where the value is fixed, so the object still
 * satisfies Vitest's own unions after a spread.
 */
interface ArtsVitestConfig {
  define?: Record<string, string>
  resolve: { alias: Record<string, string> }
  test: {
    environment: 'node'
    include: string[]
    passWithNoTests: boolean
    setupFiles: string[]
    restoreMocks: boolean
    unstubGlobals: boolean
    coverage: {
      provider: 'v8'
      include: string[]
      exclude: string[]
      reporter: string[]
    }
  }
}

/** Shared Vitest shape for Arts plugin repos — see configs/vitest.js for the rationale. */
export function createVitestConfig(options?: ArtsVitestOptions): ArtsVitestConfig
