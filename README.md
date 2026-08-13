# @arts/wp-plugin-tooling

The shared build runner, release tooling, and config bases for Arts WordPress plugins. Extracted from the per-repo `build/` directories that eight plugins carried as drifting copies — this package is the single source of truth, and repos keep only a `project.config.js`.

Verified against the originals with byte-parity builds: with the legacy autoloader suffix pinned, the zips this package produces are byte-identical to the old per-repo runners' output (cursor-follower, horizontal-scroll, and header archetypes).

## Install

```bash
pnpm add -D github:artkrsk/wp-plugin-tooling
```

## Commands

```
arts-wp dev                                 watch-compile + mirror to DEV_TARGET
arts-wp build                               release build into dist/ (stamps versions first)
arts-wp release <patch|minor|major|x.y.z>   bump, stamp, validate changelog, commit, tag
arts-wp changelog extract|validate|sync     readme.txt changelog tooling
arts-wp blueprint build|check               wp.org Live Preview blueprint
arts-wp doctor                              regenerate .mcp.json + dev/wp for the Local dev site
arts-wp init                                one-time template initializer
```

Only `dev`, `dev:plugin`, `build`, `test`, `test:coverage`, and `release` get package.json script aliases in consumer repos — everything else runs via `pnpm exec arts-wp …` (CI, lefthook, agents).

## project.config.js

```js
import process from 'node:process'

export default {
  slug: 'my-plugin-for-elementor',
  versionConstant: 'ARTS_MY_PLUGIN_VERSION',   // define() in the main plugin file
  defineKey: '__ARTS_MY_PLUGIN_VERSION__',     // esbuild define substituted in src/ts
  esbuildTarget: 'es2022',
  entry: {
    ts: './src/ts/boot.ts',
    sass: './src/styles/index.scss'            // or null
  },
  // Secondary bundles (gate loaders, editor-only scripts, vendored polyfills).
  bundles: [
    // banner: 'plugin' (default) | 'none' (inlined-into-HTML gates) | 'license'
    //         ('license' derives the banner from the entry's nearest package.json)
    // watch: false = built once per dev session (vendored code that never changes)
    // sourcemap: false (default) = never; true = dev-linked, prod-none
    { name: 'gate', entry: './src/ts/gate.ts', banner: 'none' }
  ],
  bannerLines: [],                             // extra lines in the plugin banner (3rd-party notices)
  zip: { budgetMb: 0.25 },                     // release hard-fails over budget
  paths: { php: './src/php', plugin: './src/wordpress-plugin', dist: './dist' },
  devTarget: process.env.DEV_TARGET ?? null,   // machine-specific, from gitignored .env
  vendor: {
    autoloaderOnly: true,                      // vendor/ ships the autoloader only (Strauss repos)
    autoloaderSuffix: null                     // null = derived from slug (collision-proof)
  },
  blueprint: {                                 // or null = no wp.org Live Preview
    seed: './dev/seed/demo-page.php',          // must define a *_DEMO_PAGE_ID constant
    landing: 'front',                          // 'front' | 'editor'
    extraPlugins: []                           // extra wp.org slugs to install in Playground
  }
}
```

`composer.json` is the single version source: `version`, `description`, `homepage` (the Plugin URI), `authors[0]`, and the `wordpress`/`plugin` objects feed the stamped plugin header, readme.txt, and package.json. Never hand-edit stamped fields.

## How dev sync works

`arts-wp dev` watches `src/php`, `src/wordpress-plugin`, and `vendor-prefixed` with chokidar. The initial mirror scope-cleans `src/php` at the target; after that it's per-file copies with `awaitWriteFinish` so a half-written file never reaches the site. Vendors resync only when `composer.lock` changes; a `composer.json` watcher restamps version meta live. esbuild writes bundles into `src/php/libraries/<slug>/` and the same watcher mirrors them. `DEV_TARGET` is optional — without it, dev compiles without syncing (composer-symlink consumers run their own pipeline).

## Changelog grammar

readme.txt is the single changelog source (written where wp.org reads it). Every bullet:

```
* added: …
* improved: …
* fixed: …
* security: …
```

grouped in that order; `Initial release.` for 1.0.0. `arts-wp changelog validate` enforces this — the reusable release workflow refuses to ship without a valid entry for the tagged version, and `arts-wp release` refuses to even bump. `CHANGELOG.md` is generated from readme.txt by `changelog sync`, never hand-edited.

## Config bases

| Import | What |
|---|---|
| `@arts/wp-plugin-tooling/biome` | Biome base (extends in biome.json; add per-repo `files.includes`) |
| `@arts/wp-plugin-tooling/tsconfig` | strict ES2022 tsconfig (extend; add per-repo `paths`/`include`) |
| `@arts/wp-plugin-tooling/stylelint` | stylelint-config-standard-scss + house exceptions |
| `@arts/wp-plugin-tooling/vitest` | `createVitestConfig({ defineKey })` helper |

## Release flow

1. Hand-write the readme.txt changelog entry (the one manual step).
2. `pnpm release patch` — bumps composer.json, stamps everything, validates the entry, regenerates CHANGELOG.md, commits, tags.
3. `git push && git push origin vX.Y.Z` — the tag triggers the release workflow (GitHub Release + wp.org SVN deploy where enabled).
