import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Jeder relative Import braucht die Endung `.js`.
 *
 * Auf Vercel laufen die Funktionen als echte ES-Module: dort wird nicht
 * gebündelt, und Node sucht die Datei genau so, wie sie dasteht. Ohne Endung
 * findet es nichts und der Aufruf stirbt beim Laden — mit einer Meldung, die
 * im Browser nur als «Der Server hat etwas Unerwartetes geantwortet» ankommt.
 *
 * Weder TypeScript noch die Tests noch der Dev-Server merken das: alle drei
 * lösen Importe grosszügiger auf als Node. Gemerkt hat es die Liga, als ein
 * fehlendes `.js` das Verschieben der Wochen lahmlegte — und mit ihm, unbemerkt
 * und ungetestet, auch die Playoff-Endpunkte. Darum diese Prüfung.
 */

const ROOTS = ['src/core', 'api']
const IMPORT = /\bfrom\s+'(\.[^']*)'/g

function filesIn(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...filesIn(path))
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) out.push(path)
  }
  return out
}

describe('Relative Importe', () => {
  it('enden überall auf .js, damit Node sie auf Vercel findet', () => {
    const schuldig: string[] = []

    for (const root of ROOTS) {
      for (const file of filesIn(root)) {
        const source = readFileSync(file, 'utf8')
        for (const [, target] of source.matchAll(IMPORT)) {
          if (!target.endsWith('.js')) schuldig.push(`${file.replace(/\\/g, '/')} → ${target}`)
        }
      }
    }

    expect(schuldig).toEqual([])
  })

  it('findet überhaupt etwas zum Prüfen', () => {
    // Sonst wäre der Test oben still zufrieden, weil er nichts angeschaut hat.
    expect(filesIn('api').length).toBeGreaterThan(20)
  })
})
