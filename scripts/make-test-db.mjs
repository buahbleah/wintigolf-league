/**
 * Legt eine getrennte Testdatenbank an und spielt das Schema ein.
 *
 *   node scripts/make-test-db.mjs          — anlegen und Schema einspielen
 *   node scripts/make-test-db.mjs --drop   — wieder wegwerfen
 *
 * Warum: die Liga läuft auf einer echten Datenbank mit echten Konten. Zum
 * Ausprobieren von Verwaltungsfunktionen — Rollen, Handicaps, Saison löschen —
 * braucht es eine Datenbank, in der nichts kaputtgehen kann. Dieselbe Neon-
 * Instanz, nur eine Datenbank daneben.
 *
 * Die Adresse der Testdatenbank steht danach in .env.test und wird von
 * `npm run dev:test` benutzt.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const here = dirname(fileURLToPath(import.meta.url))
const TEST_DB = 'wintigolf_test'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL fehlt.')
  process.exit(1)
}

/** Dieselbe Adresse, andere Datenbank. */
function withDatabase(connection, name) {
  const parsed = new URL(connection)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

const admin = neon(url)

if (process.argv.includes('--drop')) {
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
  console.log(`${TEST_DB} gelöscht.`)
  process.exit(0)
}

const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`
if (!existing.length) {
  await admin.query(`CREATE DATABASE ${TEST_DB}`)
  console.log(`${TEST_DB} angelegt.`)
} else {
  console.log(`${TEST_DB} gibt es schon.`)
}

const testUrl = withDatabase(url, TEST_DB)
const test = neon(testUrl)

const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8')
const statements = schema
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

for (const statement of statements) {
  try {
    await test.query(statement)
  } catch (err) {
    console.error('\nFehlgeschlagen:\n' + statement.slice(0, 200) + '\n' + err.message)
    process.exit(1)
  }
}

const tables = await test`
  SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'
`
console.log(`Schema eingespielt: ${tables[0].n} Tabellen.`)

// Die Adresse für den Test-Dev-Server hinterlegen.
const envPath = join(here, '..', '.env.test')
writeFileSync(
  envPath,
  [
    '# Von scripts/make-test-db.mjs erzeugt. Zeigt auf die Testdatenbank,',
    '# nicht auf die Liga. Von Git ausgeschlossen.',
    `DATABASE_URL=${testUrl}`,
    'MAIL_IN_DEV=0',
    '',
  ].join('\n'),
)
console.log('.env.test geschrieben — `npm run dev:test` arbeitet damit.')
