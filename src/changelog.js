import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PREFIXES = ['added', 'improved', 'fixed', 'security']
const BULLET = new RegExp(`^\\* (${PREFIXES.join('|')}): .+`)

/** The changelog section of readme.txt, split into per-version entries. */
function entries(readme) {
  const section = readme.match(/== Changelog ==([\s\S]+?)(?:\n== |$)/)
  if (!section) {
    return null
  }
  return section[1]
    .split(/(?=^= [\d.]+)/m)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** Extract one version's entry ('latest' or 'x.y.z'). Returns null when absent. */
export function extractEntry(readme, version = 'latest') {
  const all = entries(readme)
  if (!all || all.length === 0) {
    return null
  }
  return (
    (version === 'latest' ? all[0] : all.find((e) => e.startsWith(`= ${version} =`))) ?? null
  )
}

/**
 * Validate one entry against the changelog grammar:
 * every bullet `* <Added|Improved|Fixed|Security>: …`, groups in that order.
 * Returns a list of problems; empty list = valid.
 */
export function validateEntry(entry, version) {
  if (!entry) {
    return [`No changelog entry for version ${version} in readme.txt`]
  }
  const lines = entry
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return [`Changelog entry for ${version} is empty`]
  }
  if (lines.length === 1 && lines[0] === 'Initial release.') {
    return []
  }

  const problems = []
  let lastGroup = -1
  for (const line of lines) {
    if (!line.startsWith('* ')) {
      problems.push(`Not a bullet line: "${line}" — every change is a "* Prefix: …" bullet`)
      continue
    }
    if (!BULLET.test(line)) {
      problems.push(`Bullet lacks a valid prefix (${PREFIXES.join('/')}): "${line}"`)
      continue
    }
    const group = PREFIXES.indexOf(line.slice(2, line.indexOf(':')))
    if (group < lastGroup) {
      problems.push(
        `Bullets out of order: "${line}" — group by ${PREFIXES.join(', ')}, in that order`
      )
    }
    lastGroup = Math.max(lastGroup, group)
  }
  return problems
}

/** Convert readme.txt's changelog into CHANGELOG.md content (generated — never hand-edited). */
export function readmeToChangelogMd(readme) {
  const all = entries(readme) ?? []
  const sections = all.map((entry) => {
    const [heading, ...rest] = entry.split('\n')
    const version = heading.match(/= ([\d.]+) =/)?.[1] ?? heading
    const body = rest.map((l) => l.trim()).filter(Boolean)
    return `## ${version}\n\n${body.join('\n')}`
  })
  return `# Changelog\n\n${sections.join('\n\n')}\n`
}

const README_REL = 'src/wordpress-plugin/readme.txt'

function readReadme(root) {
  return readFileSync(path.resolve(root, README_REL), 'utf8')
}

/** CLI: print an entry (release-body extraction). Throws on absence. */
export function extractCmd(root, version) {
  const entry = extractEntry(readReadme(root), version)
  if (!entry) {
    throw new Error(`No changelog entry for version ${version} in ${README_REL}`)
  }
  return entry
}

/** CLI: validate an entry against the grammar. Throws with all problems on failure. */
export function validateCmd(root, version) {
  const readme = readReadme(root)
  const target = version === 'latest' ? 'latest' : version
  const problems = validateEntry(extractEntry(readme, target), target)
  if (problems.length > 0) {
    throw new Error(`Changelog validation failed:\n  - ${problems.join('\n  - ')}`)
  }
}

/** CLI: regenerate CHANGELOG.md from readme.txt. */
export function syncCmd(root) {
  const md = readmeToChangelogMd(readReadme(root))
  writeFileSync(path.resolve(root, 'CHANGELOG.md'), md)
}
