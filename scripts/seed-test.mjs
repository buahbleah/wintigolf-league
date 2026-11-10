/**
 * Füllt die **Testdatenbank** (nicht die Liga) mit drei Konten und einer
 * Entwurfs-Saison, damit sich die Verwaltung durchklicken lässt.
 *
 *   node scripts/seed-test.mjs
 *
 * Passwort für alle: testlauf-2026
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const url = process.env.DATABASE_URL
if (!url || !url.includes('wintigolf_test')) {
  console.error('Zeigt nicht auf die Testdatenbank. Erst `npm run db:test` laufen lassen.')
  process.exit(1)
}

const sql = neon(url)
const salt = randomBytes(16)
const pw = `scrypt$${salt.toString('hex')}$${scryptSync('testlauf-2026', salt, 64).toString('hex')}`

await sql`DELETE FROM seasons`
await sql`DELETE FROM users`

const people = [
  ['chef@example.com', 'Chefin Test', 'admin', 24.0],
  ['zwei@example.com', 'Zweiter Test', 'member', 18.0],
  ['drei@example.com', 'Dritte Test', 'member', 30.0],
]
const ids = {}
for (const [email, name, role, hcp] of people) {
  const row = await sql`
    INSERT INTO users (email, name, password_hash, role, outdoor_handicap, color_index)
    VALUES (${email}, ${name}, ${pw}, ${role}, ${hcp}, 0) RETURNING id`
  ids[email] = row[0].id
}

const season = await sql`
  INSERT INTO seasons (name, join_code, status, settings)
  VALUES ('Testsaison', 'TST001', 'draft', '{}'::jsonb) RETURNING id`
const sid = season[0].id

for (const [email, , , hcp] of people) {
  await sql`
    INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
    VALUES (${sid}, ${ids[email]}, ${hcp / 2}, ${hcp / 2})`
}

await sql`
  INSERT INTO weeks (season_id, number, starts_at, ends_at, status)
  SELECT ${sid}, n, now() + make_interval(days => (n - 1) * 7),
         now() + make_interval(days => (n - 1) * 7 + 6), 'upcoming'
  FROM generate_series(1, 10) AS n`

console.log('Testdatenbank gefüllt: drei Konten, eine Entwurfs-Saison, zehn Wochen.')
console.log('Anmelden als chef@example.com / testlauf-2026')
