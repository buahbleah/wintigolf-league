/**
 * Erzeugt die App-Icons aus einer SVG-Quelle.
 *
 *   node scripts/make-icons.mjs
 *
 * Drei Grössen, weil Android und iOS Verschiedenes wollen:
 *   icon-192 / icon-512   — das Symbol mit etwas Luft, für den Startbildschirm
 *   icon-maskable-512     — randvoll mit Hintergrund, damit Android es in jede
 *                           Form schneiden kann, ohne dass die Fahne abfällt
 *
 * Dasselbe Motiv wie in der App: ein Grün von oben, das Loch, die Fahne.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public', 'icons')
mkdirSync(out, { recursive: true })

const BG = '#0b0f0d'
const GREEN = '#37d67a'
const INK = '#ffffff'

/** `inset` ist der Rand in Prozent: 0 für maskable, sonst etwas Luft. */
function mark(size, inset) {
  const pad = size * inset
  const box = size - pad * 2
  const s = (v) => pad + (v / 32) * box

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <circle cx="${s(16)}" cy="${s(16)}" r="${(15 / 32) * box}" fill="none"
          stroke="${GREEN}" stroke-opacity="0.22" stroke-width="${(1.5 / 32) * box}"/>
  <circle cx="${s(14)}" cy="${s(20)}" r="${(3.2 / 32) * box}" fill="${GREEN}" fill-opacity="0.18"/>
  <circle cx="${s(14)}" cy="${s(20)}" r="${(1.5 / 32) * box}" fill="${GREEN}"/>
  <path d="M ${s(14)} ${s(20)} L ${s(14)} ${s(7)}" stroke="${INK}"
        stroke-width="${(1.8 / 32) * box}" stroke-linecap="round" fill="none"/>
  <path d="M ${s(14)} ${s(7.6)} L ${s(22.5)} ${s(7.6)} L ${s(20.6)} ${s(10.4)} L ${s(22.5)} ${s(13.2)} L ${s(14)} ${s(13.2)} Z"
        fill="${GREEN}"/>
</svg>`
}

const jobs = [
  { file: 'icon-192.png', size: 192, inset: 0.12 },
  { file: 'icon-512.png', size: 512, inset: 0.12 },
  // Maskable braucht die Sicherheitszone: das Motiv sitzt in den inneren 80 %.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.2 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.1 },
]

for (const job of jobs) {
  const svg = Buffer.from(mark(job.size, job.inset))
  await sharp(svg).png().toFile(join(out, job.file))
  console.log(`${job.file} (${job.size}px)`)
}

writeFileSync(join(out, 'icon.svg'), mark(512, 0.12))
console.log('icon.svg')
