/**
 * Eine Testsaison zum Ausprobieren: zwei Konten, zehn Wochen, Woche 1 läuft
 * gerade mit einem fertigen Kurs.
 *
 *   node scripts/seed-demo.mjs            — nur wenn keine Saison existiert
 *   node scripts/seed-demo.mjs --force    — löscht die vorhandene Saison
 *
 * Nur für die Entwicklung. Die beiden Konten heissen test-a@example.com und
 * test-b@example.com, Passwort "testlauf-2026"; echte Mails gehen an sie nie
 * raus, weil der Versand lokal abgeschaltet ist.
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

const force = process.argv.includes('--force')
const existing = await sql`SELECT count(*)::int AS n FROM seasons`
if (existing[0].n > 0 && !force) {
  console.error(
    'Es gibt schon eine Saison. Mit --force wird sie gelöscht — in einer echten Liga niemals tun.',
  )
  process.exit(1)
}

await sql`DELETE FROM seasons`
await sql`DELETE FROM users WHERE email LIKE 'test-%@example.com'`

const pw = hash('testlauf-2026')
const a = await sql`INSERT INTO users (email, name, password_hash, role, outdoor_handicap, color_index)
  VALUES ('test-a@example.com', 'Testi Admin', ${pw}, 'admin', 24.5, 0) RETURNING id`
const b = await sql`INSERT INTO users (email, name, password_hash, role, outdoor_handicap, color_index)
  VALUES ('test-b@example.com', 'Testa Mitspieler', ${pw}, 'member', 18.0, 1) RETURNING id`

const season = await sql`INSERT INTO seasons (name, join_code, status, settings, started_at)
  VALUES ('Testsaison', 'TEST01', 'active', '{}'::jsonb, now()) RETURNING id`
const sid = season[0].id

await sql`INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
  VALUES (${sid}, ${a[0].id}, 12.3, 12.3), (${sid}, ${b[0].id}, 9.0, 9.0)`

// Woche 1 läuft gerade: von vorgestern bis in fünf Tagen.
const week = await sql`INSERT INTO weeks (season_id, number, starts_at, ends_at, status, picker_id)
  VALUES (${sid}, 1, now() - interval '2 days', now() + interval '5 days', 'open', ${a[0].id})
  RETURNING id`

const course = await sql`INSERT INTO courses (season_id, name, tee, par, course_rating, slope_rating,
    length_m, rating_source, created_by)
  VALUES (${sid}, 'Testkurs Winterthur', 'Gelb', 72, 71.4, 128, 5800, 'gspro', ${a[0].id})
  RETURNING id`

const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
const sis = [5, 11, 17, 1, 7, 13, 15, 3, 9, 6, 12, 18, 2, 8, 14, 16, 4, 10]
const numbers = pars.map((_, i) => i + 1)
await sql`INSERT INTO course_holes (course_id, number, par, stroke_index)
  SELECT ${course[0].id}, n, p, si
  FROM unnest(${numbers}::int[], ${pars}::int[], ${sis}::int[]) AS t(n, p, si)`

await sql`UPDATE weeks SET course_id = ${course[0].id} WHERE id = ${week[0].id}`

// Die übrigen neun Wochen, damit die Liste echt aussieht.
await sql`INSERT INTO weeks (season_id, number, starts_at, ends_at, status)
  SELECT ${sid}, n, now() + make_interval(days => (n - 1) * 7 - 2),
         now() + make_interval(days => (n - 1) * 7 + 5), 'upcoming'
  FROM generate_series(2, 10) AS n`

/* ------------------------------------------------------- gespielte Wochen
 * Mit --rounds entstehen fertige Runden für die ersten Wochen, damit Tabelle,
 * Power Rankings und Handicap-Verlauf etwas zu zeigen haben. Die Handicaps
 * rechnet danach `POST /api/admin/recompute` durch — die Rechnung gehört in den
 * Motor, nicht in ein Seed-Skript.
 */
if (process.argv.includes('--rounds')) {
  const pastWeeks = 5
  // Die ersten Wochen in die Vergangenheit legen, damit sie abgeschlossen sind.
  await sql`
    UPDATE weeks SET starts_at = now() - make_interval(days => (${pastWeeks} - number + 1) * 7),
                     ends_at = now() - make_interval(days => (${pastWeeks} - number) * 7 + 1),
                     status = 'closed'
    WHERE season_id = ${sid} AND number <= ${pastWeeks}
  `
  // Alle gespielten Wochen laufen auf demselben Kurs — für eine Demo reicht das.
  await sql`UPDATE weeks SET course_id = ${course[0].id} WHERE season_id = ${sid} AND number <= ${pastWeeks}`
  // Und die Woche danach läuft gerade.
  await sql`
    UPDATE weeks SET starts_at = now() - interval '2 days', ends_at = now() + interval '5 days',
                     status = 'open', course_id = ${course[0].id}
    WHERE season_id = ${sid} AND number = ${pastWeeks + 1}
  `

  const weeks = await sql`
    SELECT id, number FROM weeks WHERE season_id = ${sid} AND number <= ${pastWeeks} ORDER BY number
  `
  /* Brutto über Par je Woche — Testi schwankt, Testa spielt gleichmässiger und
     etwas besser. Die Schläge werden danach über die Löcher verteilt, damit eine
     Karte aussieht wie eine Karte und nicht wie eine Formel. */
  const scripted = {
    [a[0].id]: { hcp: 12.3, over: [16, 12, 19, 23, 14] },
    [b[0].id]: { hcp: 9.0, over: [11, 9, 13, 10, 8] },
  }

  /** `over` Schläge auf die achtzehn Löcher verteilen, beim schwersten beginnend. */
  const spread = (over) => {
    const order = numbers
      .map((n, i) => ({ n, si: sis[i] }))
      .sort((x, y) => x.si - y.si)
      .map((h) => h.n)
    const extra = Object.fromEntries(numbers.map((n) => [n, 0]))
    for (let i = 0; i < over; i++) extra[order[i % 18]]++
    return numbers.map((n, i) => pars[i] + extra[n])
  }

  for (const w of weeks) {
    for (const [userId, plan] of Object.entries(scripted)) {
      const over = plan.over[w.number - 1]
      const playing = Math.round(plan.hcp * (128 / 113) + (71.4 - 72))
      const round = await sql`
        INSERT INTO rounds (season_id, week_id, user_id, course_id, handicap_index,
                            playing_handicap, status, marker_id, confirmed_by, confirmed_at,
                            played_at)
        VALUES (${sid}, ${w.id}, ${userId}, ${course[0].id}, ${plan.hcp}, ${playing},
                'confirmed', ${userId === a[0].id ? b[0].id : a[0].id},
                ${userId === a[0].id ? b[0].id : a[0].id}, now(), now())
        RETURNING id`
      const strokes = spread(over)
      await sql`
        INSERT INTO round_holes (round_id, number, strokes)
        SELECT ${round[0].id}, n, s
        FROM unnest(${numbers}::int[], ${strokes}::int[]) AS t(n, s)`
    }
  }
  console.log(`${weeks.length} Wochen mit Runden angelegt. Handicaps rechnet /api/admin/recompute.`)
}

console.log('Testdaten angelegt. Woche 1 =', week[0].id)
