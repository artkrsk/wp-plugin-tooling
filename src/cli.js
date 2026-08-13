#!/usr/bin/env node
import process from 'node:process'
import { buildBlueprint, checkBlueprint } from './blueprint.js'
import { extractCmd, syncCmd, validateCmd } from './changelog.js'
import { loadCtx } from './config.js'
import { dev } from './dev.js'
import { doctor } from './doctor.js'
import { init } from './init.js'
import { log } from './log.js'
import { stampAll } from './meta.js'
import { buildRelease } from './package.js'
import { release } from './release.js'

const [command, sub, ...rest] = process.argv.slice(2)

function flag(name) {
  const args = [sub, ...rest].filter(Boolean)
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  return args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]
}

const USAGE = `arts-wp <command>

  dev                                 watch-compile + mirror to DEV_TARGET
  build                               release build into dist/
  release <patch|minor|major|x.y.z>   bump, stamp, validate changelog, commit, tag
  changelog extract  [--version v|--latest]   print an entry (release body)
  changelog validate [--version v|--latest]   enforce the changelog grammar
  changelog sync                      regenerate CHANGELOG.md from readme.txt
  blueprint build|check               wp.org Live Preview blueprint
  doctor                              regenerate .mcp.json + dev/wp for the Local dev site
  init [--slug s --name n]            one-time template initializer`

try {
  switch (command) {
    case 'dev': {
      await dev(await loadCtx())
      break
    }
    case 'build': {
      const ctx = await loadCtx()
      stampAll(ctx)
      await buildRelease(ctx)
      break
    }
    case 'release': {
      if (!sub) throw new Error('release needs a version spec: patch | minor | major | x.y.z')
      await release(sub, loadCtx)
      break
    }
    case 'changelog': {
      const version = flag('latest') ? 'latest' : (flag('version') ?? 'latest')
      if (sub === 'extract') {
        console.log(extractCmd(process.cwd(), version))
      } else if (sub === 'validate') {
        validateCmd(process.cwd(), version)
        log.success(`Changelog entry for ${version} is valid`)
      } else if (sub === 'sync') {
        syncCmd(process.cwd())
        log.success('CHANGELOG.md regenerated from readme.txt')
      } else {
        throw new Error('changelog needs a subcommand: extract | validate | sync')
      }
      break
    }
    case 'blueprint': {
      const ctx = await loadCtx()
      if (sub === 'build') {
        const out = buildBlueprint(ctx)
        log.success(`Blueprint written: ${out}`)
      } else if (sub === 'check') {
        checkBlueprint(ctx)
        log.success('Blueprint is current')
      } else {
        throw new Error('blueprint needs a subcommand: build | check')
      }
      break
    }
    case 'doctor': {
      const problems = doctor(await loadCtx())
      if (problems.length > 0) process.exitCode = 1
      break
    }
    case 'init': {
      await init(process.cwd(), { slug: flag('slug'), name: flag('name') })
      break
    }
    default: {
      console.log(USAGE)
      if (command !== undefined && command !== 'help' && command !== '--help') {
        process.exitCode = 1
      }
    }
  }
} catch (err) {
  log.error(err)
  process.exit(1)
}
