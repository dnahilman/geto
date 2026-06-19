import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Enforces the modular-monolith boundary: the dialect-agnostic core and the HTTP
// routes must never reach into a concrete engine implementation
// (`db/drivers/<engine>/*`). They speak only through `DbDriver` / `ProviderAdapter`.
// The single sanctioned seam is `db/adapters.ts`, which may import each engine's
// *adapter barrel* (`drivers/<engine>/adapter`) and nothing deeper. If this test
// fails, a dialect leaked.
const SRC = join(import.meta.dir, '../src')

/** All static + dynamic import specifiers in a file (ignores comments/strings). */
function importSpecifiers(relPath: string): string[] {
  const text = readFileSync(join(SRC, relPath), 'utf8')
  const specs: string[] = []
  for (const re of [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) specs.push(m[1])
  }
  return specs
}

const touchesEngine = (spec: string) => /\/db\/drivers\/[^/]+\//.test(spec)
const isAdapterBarrel = (spec: string) => /\/db\/drivers\/[^/]+\/adapter$/.test(spec)

describe('architecture: dialect-agnostic core boundary', () => {
  const routeFiles = readdirSync(join(SRC, 'routes'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `routes/${f}`)
  const guarded = ['db/driver.ts', 'db/types.ts', ...routeFiles]

  for (const rel of guarded) {
    test(`${rel} imports no engine implementation`, () => {
      expect(importSpecifiers(rel).filter(touchesEngine)).toEqual([])
    })
  }

  test('db/adapters.ts only imports engine adapter barrels, never internals', () => {
    const leaks = importSpecifiers('db/adapters.ts')
      .filter(touchesEngine)
      .filter((s) => !isAdapterBarrel(s))
    expect(leaks).toEqual([])
  })
})
