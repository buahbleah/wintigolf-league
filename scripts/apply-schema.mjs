/**
 * Spielt db/schema.sql gegen die Datenbank in DATABASE_URL ein.
 *
 *   npm run db:apply
 *
 * Das Schema ist idempotent, der Befehl darf also jederzeit wiederholt werden.
 * Die Anweisungen werden einzeln geschickt, weil der HTTP-Treiber von Neon pro
 * Aufruf genau eine Anweisung ausführt.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

// Lokal stehen die Zugangsdaten in .env.local, auf Vercel in den Projekt-Variablen.
dotenv.config({ path: '.env.local' })
dotenv.config()

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(here, '..', 'db', 'schema.sql')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL fehlt. Trag sie in .env.local ein.')
  process.exit(1)
}

const sql = neon(url)
const text = readFileSync(schemaPath, 'utf8')

// Kommentarzeilen raus, dann an jedem Semikolon trennen. Das Schema enthält
// bewusst keine Funktionen oder $$-Blöcke, darum reicht das.
const statements = text
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

let applied = 0
for (const statement of statements) {
  try {
    await sql.query(statement)
    applied++
  } catch (err) {
    console.error('\nFehlgeschlagen:\n' + statement.slice(0, 300))
    console.error('\n' + err.message)
    process.exit(1)
  }
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`
console.log(`${applied} Anweisungen ausgeführt.`)
console.log(`${tables.length} Tabellen: ${tables.map((t) => t.table_name).join(', ')}`)
