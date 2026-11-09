/**
 * Eine Testsaison, bei der die Grundsaison fertig ist: vier Spieler, zehn
 * abgeschlossene Wochen mit bestätigten Runden. Damit lässt sich das Playoff
 * ausprobieren, ohne zehn Wochen zu warten.
 *
 *   node scripts/seed-playoffs.mjs --force
 *
 * Nur für die Entwicklung. Passwort für alle: testlauf-2026
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL)

function hash(password) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
}

if (!process.argv.includes('--force')) {
  console.error('Löscht alle Saisons. Mit --force bestätigen.')
  process.exit(1)
}

await sql`DELETE FROM seasons`
await sql`DELETE FROM users WHERE email LIKE 'test-%@example.com'`

const pw = hash('testlauf-2026')
const people = [
  { email: 'test-a@example.com', name: 'Testi Admin', role: 'admin', outdoor: 24.5, hcp: 12.3, over: [14, 12, 16, 11, 13, 15, 12, 14, 10, 13] },
  { email: 'test-b@example.com', name: 'Testa Mitspieler', role: 'member', outdoor: 18.0, hcp: 9.0, over: [11, 9, 13, 10, 8, 12, 10, 11, 9, 10] },
  { email: 'test-c@example.com', name: 'Cem Chip', role: 'member', outdoor: 30.0, hcp: 15.0, over: [18, 20, 17, 19, 16, 21, 18, 17, 19, 18] },
  { email: 'test-d@example.com', name: 'Dora Drive', role: 'member', outdoor: 12.0, hcp: 6.0, over: [8, 7, 9, 6, 8, 7, 10, 8, 7, 9] },
]

const ids = {}
for (const person of people) {
  const row = await sql`
    INSERT INTO users (email, name, password_hash, role, outdoor_handicap, color_index)
    VALUES (${person.email}, ${person.name}, ${pw}, ${person.role}, ${person.outdoor}, 0)
    RETURNING id`
  ids[person.email] = row[0].id
}

const season = await sql`
  INSERT INTO seasons (name, join_code, status, settings, started_at)
  VALUES ('Playoff-Test', 'PLAY01', 'active', '{"playoffSize": 4, "thirdPlace": true}'::jsonb, now())
  RETURNING id`
const sid = season[0].id

for (const person of people) {
  await sql`
    INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
    VALUES (${sid}, ${ids[person.email]}, ${person.hcp}, ${person.hcp})`
}

const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
const sis = [5, 11, 17, 1, 7, 13, 15, 3, 9, 6, 12, 18, 2, 8, 14, 16, 4, 10]
const numbers = pars.map((_, i) => i + 1)

const spread = (over) => {
  const order = numbers
    .map((n, i) => ({ n, si: sis[i] }))
    .sort((x, y) => x.si - y.si)
    .map((h) => h.n)
  const extra = Object.fromEntries(numbers.map((n) => [n, 0]))
  for (let i = 0; i < over; i++) extra[order[i % 18]]++
  return numbers.map((n, i) => pars[i] + extra[n])
}

/* Zehn abgeschlossene Wochen, jede auf einem eigenen Kurs. */
for (let week = 1; week <= 10; week++) {
  const course = await sql`
    INSERT INTO courses (season_id, name, tee, par, course_rating, slope_rating, length_m,
                         rating_source, created_by)
    VALUES (${sid}, ${'Testkurs ' + week}, 'Gelb', 72, 71.4, 128, 5800, 'gspro',
            ${ids['test-a@example.com']})
    RETURNING id`
  await sql`
    INSERT INTO course_holes (course_id, number, par, stroke_index)
    SELECT ${course[0].id}, n, p, si
    FROM unnest(${numbers}::int[], ${pars}::int[], ${sis}::int[]) AS t(n, p, si)`

  const w = await sql`
    INSERT INTO weeks (season_id, number, starts_at, ends_at, status, course_id, picker_id)
    VALUES (${sid}, ${week},
            now() - make_interval(days => (11 - ${week}) * 7),
            now() - make_interval(days => (10 - ${week}) * 7 + 1),
            'closed', ${course[0].id}, ${ids[people[(week - 1) % people.length].email]})
    RETURNING id`

  for (const person of people) {
    const playing = Math.round(person.hcp * (128 / 113) + (71.4 - 72))
    const marker = people.find((p) => p.email !== person.email)
    const round = await sql`
      INSERT INTO rounds (season_id, week_id, user_id, course_id, handicap_index, playing_handicap,
                          status, marker_id, confirmed_by, confirmed_at, played_at)
      VALUES (${sid}, ${w[0].id}, ${ids[person.email]}, ${course[0].id}, ${person.hcp}, ${playing},
              'confirmed', ${ids[marker.email]}, ${ids[marker.email]}, now(), now())
      RETURNING id`
    const strokes = spread(person.over[week - 1])
    await sql`
      INSERT INTO round_holes (round_id, number, strokes)
      SELECT ${round[0].id}, n, s
      FROM unnest(${numbers}::int[], ${strokes}::int[]) AS t(n, s)`
  }
}

console.log('Grundsaison fertig: 4 Spieler, 10 abgeschlossene Wochen.')
console.log('Jetzt als test-a@example.com anmelden und die Playoffs starten.')
