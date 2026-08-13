import process from 'node:process'

// Side-effect module: import FIRST so .env is loaded before project.config.js evaluates.
// Machine-specific values (DEV_TARGET) live in the gitignored .env, not in committed config.
try {
  process.loadEnvFile()
} catch {
  // No .env — fine: committed defaults apply, dev mode fails fast if DEV_TARGET is needed
}
