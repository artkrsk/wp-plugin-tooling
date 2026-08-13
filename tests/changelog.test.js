import { describe, expect, it } from 'vitest'
import { extractEntry, readmeToChangelogMd, validateEntry } from '../src/changelog.js'

const README = `=== Test Plugin ===
Stable tag: 1.2.0

== Description ==
A plugin.

== Changelog ==

= 1.2.0 =
* added: a shiny new thing.
* improved: an existing thing.
* fixed: a broken thing.

= 1.1.0 =
* fixed: the only change.

= 1.0.0 =
Initial release.

== Upgrade Notice ==
None.
`

describe('extractEntry', () => {
  it('extracts the latest entry', () => {
    const entry = extractEntry(README, 'latest')
    expect(entry).toContain('= 1.2.0 =')
    expect(entry).toContain('* added: a shiny new thing.')
    expect(entry).not.toContain('1.1.0')
  })

  it('extracts a specific version', () => {
    expect(extractEntry(README, '1.1.0')).toContain('* fixed: the only change.')
  })

  it('returns null for a missing version', () => {
    expect(extractEntry(README, '9.9.9')).toBeNull()
  })

  it('does not bleed into the next == section', () => {
    expect(extractEntry(README, '1.0.0')).not.toContain('Upgrade Notice')
  })
})

describe('validateEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(validateEntry(extractEntry(README, '1.2.0'), '1.2.0')).toEqual([])
  })

  it('accepts "Initial release."', () => {
    expect(validateEntry(extractEntry(README, '1.0.0'), '1.0.0')).toEqual([])
  })

  it('rejects a null entry (missing from readme)', () => {
    const problems = validateEntry(null, '9.9.9')
    expect(problems.some((p) => /no changelog entry/i.test(p))).toBe(true)
  })

  it('rejects bullets without a valid prefix', () => {
    const entry = '= 2.0.0 =\n* Made things better somehow.'
    const problems = validateEntry(entry, '2.0.0')
    expect(problems.some((p) => /prefix/i.test(p))).toBe(true)
  })

  it('rejects an entry with a heading but no bullets', () => {
    const problems = validateEntry('= 2.0.0 =', '2.0.0')
    expect(problems.some((p) => /empty/i.test(p))).toBe(true)
  })

  it('rejects prefixes out of the canonical order (Added, Improved, Fixed, Security)', () => {
    const entry = '= 2.0.0 =\n* fixed: one thing.\n* added: another.'
    const problems = validateEntry(entry, '2.0.0')
    expect(problems.some((p) => /order/i.test(p))).toBe(true)
  })

  it('accepts Security as the last group', () => {
    const entry =
      '= 2.0.0 =\n* added: one.\n* improved: two.\n* fixed: three.\n* security: four.'
    expect(validateEntry(entry, '2.0.0')).toEqual([])
  })
})

describe('readmeToChangelogMd', () => {
  it('converts the readme changelog into CHANGELOG.md content', () => {
    const md = readmeToChangelogMd(README)
    expect(md).toMatch(/^# Changelog/)
    expect(md).toContain('## 1.2.0')
    expect(md).toContain('* added: a shiny new thing.')
    expect(md).toContain('## 1.0.0')
    expect(md).toContain('Initial release.')
    expect(md).not.toContain('Upgrade Notice')
  })
})
