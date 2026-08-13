import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * wp.org Live Preview blueprint, generated — never hand-edited.
 *
 * Self-contained by design: the seed script is inlined as a writeFile step
 * rather than fetched. wp.org's SVN serves no CORS headers so a blueprint
 * cannot pull its own assets back down, and a GitHub-raw dependency would put
 * the live preview at the mercy of a repo URL plus a tag bump every release.
 * Assets the demo needs are embedded inside the seed itself for the same
 * reason. The plugin under preview is installed by wp.org automatically.
 */
export function generateBlueprint(ctx) {
  const bp = ctx.config.blueprint
  if (!bp) {
    throw new Error('No "blueprint" block in project.config.js — nothing to generate')
  }
  const seed = readFileSync(ctx.paths.blueprintSeed, 'utf8')

  // Single source of truth for the page id: the landingPage and the seeder cannot drift.
  const pageId = seed.match(/define\(\s*'[A-Z0-9_]*DEMO_PAGE_ID'\s*,\s*(\d+)\s*\)/)?.[1]
  if (!pageId) {
    throw new Error(
      `Could not read a *DEMO_PAGE_ID define() out of ${path.relative(ctx.root, ctx.paths.blueprintSeed)}`
    )
  }

  // `wp eval-file` silently declines to execute a PHP file containing a very
  // long line, and seeds carry large embedded blobs. They are emitted wrapped;
  // guard it here so a future minified regeneration fails the build instead of
  // the seeder.
  const longest = seed.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  if (longest > 4000) {
    throw new Error(
      `Blueprint seed has a ${longest}-char line — long lines stop \`wp eval-file\`. Wrap the blobs.`
    )
  }

  // 'front': the plugin is judged by how the page feels; `?page_id=` rather
  // than a pretty permalink so it resolves without flushed rewrite rules.
  // 'editor': the plugin's UI lives inside the Elementor editor.
  const landingPage =
    bp.landing === 'front' ? `/?page_id=${pageId}` : `/wp-admin/post.php?post=${pageId}&action=elementor`

  const seedPath = `/wordpress/wp-content/${ctx.config.slug}-demo-seed.php`

  return {
    $schema: 'https://playground.wordpress.net/blueprint-schema.json',
    landingPage,
    preferredVersions: { php: '8.1', wp: 'latest' },
    // Required: without it the wordpress.org plugin/theme installs fail on CORS.
    features: { networking: true },
    login: true,
    steps: [
      {
        step: 'installPlugin',
        pluginData: { resource: 'wordpress.org/plugins', slug: 'elementor' },
        options: { activate: true }
      },
      ...bp.extraPlugins.map((slug) => ({
        step: 'installPlugin',
        pluginData: { resource: 'wordpress.org/plugins', slug },
        options: { activate: true }
      })),
      {
        step: 'installTheme',
        themeData: { resource: 'wordpress.org/themes', slug: 'hello-elementor' },
        options: { activate: true }
      },
      { step: 'writeFile', path: seedPath, data: seed },
      {
        step: 'runPHP',
        code: `<?php require_once '/wordpress/wp-load.php'; require '${seedPath}';`
      }
    ]
  }
}

export function buildBlueprint(ctx) {
  const blueprint = generateBlueprint(ctx)
  mkdirSync(path.dirname(ctx.paths.blueprintOut), { recursive: true })
  writeFileSync(ctx.paths.blueprintOut, `${JSON.stringify(blueprint, null, 2)}\n`)
  return ctx.paths.blueprintOut
}

/** CI staleness gate: the committed blueprint must equal a fresh generation. */
export function checkBlueprint(ctx) {
  const fresh = `${JSON.stringify(generateBlueprint(ctx), null, 2)}\n`
  if (!existsSync(ctx.paths.blueprintOut)) {
    throw new Error(`No committed blueprint at ${ctx.paths.blueprintOut} — run \`arts-wp blueprint build\``)
  }
  const committed = readFileSync(ctx.paths.blueprintOut, 'utf8')
  if (committed !== fresh) {
    throw new Error(
      'blueprint.json is stale — the seed changed without regenerating. Run `arts-wp blueprint build` and commit the result.'
    )
  }
}
