import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PREFIXES = ['added', 'improved', 'fixed', 'security']
const BULLET = new RegExp(`^\\* (${PREFIXES.join('|')}): .+`)
const SECTION = /== Changelog ==([\s\S]+?)(?:\n== |$)/
/** `= 1.2.0 =` while drafted; `arts-wp release` dates it: `= 1.2.0 – October 21, 2026 =` (en dash). */
const HEADING = /^= (\d+\.\d+\.\d+)(?: – (.+))? =$/
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
})

/** A release date as headings spell it: the UTC calendar day, e.g. "October 21, 2026". */
export function formatDate(date) {
  return DATE_FORMAT.format(date)
}

/** A real day spelled exactly as formatDate spells it ("October 1", not "October 01" or "Oct 1"). */
function isReleaseDate(text) {
  const match = text.match(/^([A-Z][a-z]+) (\d+), (\d{4})$/)
  if (!match) {
    return false
  }
  const month = MONTHS.indexOf(match[1])
  return (
    month >= 0 && formatDate(new Date(Date.UTC(Number(match[3]), month, Number(match[2])))) === text
  )
}

/** `{ version, date }` from an entry's heading line; null when it is not a version heading. */
function parseHeading(entry) {
  const match = entry.split('\n', 1)[0].trim().match(HEADING)
  return match ? { version: match[1], date: match[2] ?? null } : null
}

/** The changelog section of readme.txt, split into per-version entries. */
function entries(readme) {
  const section = readme.match(SECTION)
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
    (version === 'latest' ? all[0] : all.find((e) => parseHeading(e)?.version === version)) ?? null
  )
}

/**
 * Date one version's heading (replacing any date it carries). Only the Changelog section is
 * touched: an Upgrade Notice section uses the same `= x.y.z =` headings.
 */
export function stampDate(readme, version, date) {
  const section = readme.match(SECTION)
  const heading = new RegExp(`^= ${version.replaceAll('.', '\\.')}(?: – .+)? =$`, 'm')
  if (!section || !heading.test(section[1])) {
    throw new Error(`No changelog entry for version ${version} in readme.txt`)
  }
  const start = section.index + '== Changelog =='.length
  const body = section[1].replace(heading, () => `= ${version} – ${formatDate(date)} =`)
  return readme.slice(0, start) + body + readme.slice(start + section[1].length)
}

/** Problems with an entry's heading line: its shape, and its date when it carries one. */
function headingProblems(entry) {
  const heading = parseHeading(entry)
  if (!heading) {
    return [
      `Heading must be "= X.Y.Z =" or "= X.Y.Z – Month D, YYYY =" (en dash): "${entry.split('\n', 1)[0]}"`
    ]
  }
  if (heading.date && !isReleaseDate(heading.date)) {
    return [`Release date must be a real day spelled like "October 21, 2026": "${heading.date}"`]
  }
  return []
}

/**
 * Validate one entry against the changelog grammar: a `= x.y.z =` heading, dated or not,
 * and every bullet `* <Added|Improved|Fixed|Security>: …`, groups in that order.
 * Returns a list of problems; empty list = valid.
 */
export function validateEntry(entry, version) {
  if (!entry) {
    return [`No changelog entry for version ${version} in readme.txt`]
  }
  const problems = headingProblems(entry)
  const lines = entry
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return [...problems, `Changelog entry for ${version} is empty`]
  }
  if (lines.length === 1 && lines[0] === 'Initial release.') {
    return problems
  }

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
    const title = heading.trim().match(/^= (.+) =$/)?.[1] ?? heading
    const body = rest.map((l) => l.trim()).filter(Boolean)
    return `## ${title}\n\n${body.join('\n')}`
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
