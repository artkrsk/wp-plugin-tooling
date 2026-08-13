interface ArtsVitestOptions {
  /** esbuild define key substituted in src/ts (e.g. '__ARTS_X_VERSION__') */
  defineKey?: string
  setupFiles?: string[]
}

/** Shared Vitest shape for Arts plugin repos — see configs/vitest.js for the rationale. */
export function createVitestConfig(options?: ArtsVitestOptions): Record<string, unknown>
