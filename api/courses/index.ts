import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, optionalNumber, requireString } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, settingsOf } from '../_lib/season.js'

/**
 * Den Kurs einer Woche eintragen.
 *
 * Eintragen darf der Spieler, dem die Woche gehört — bis zur Deadline — und der
 * Admin jederzeit. Geprüft wird alles, was später das Ergebnis verzerren würde:
 * achtzehn Löcher, jeder Stroke-Index genau einmal, Par passt zur Summe, Länge
 * in der erlaubten Spanne, und ein Rating, das wirklich eines ist.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') return list(req, res)
  return create(req, res)
})

async function list(req: VercelRequest, res: VercelResponse) {
  await requireUser(req)
  const season = await currentSeason()
  if (!season) {
    json(res, 200, { courses: [] })
    return
  }
  const courses = (await sql`
    SELECT c.id, c.name, c.tee, c.par, c.course_rating, c.slope_rating, c.length_m,
           c.rating_source, c.notes, w.number AS week_number
    FROM courses c
    LEFT JOIN weeks w ON w.course_id = c.id
    WHERE c.season_id = ${season.id}
    ORDER BY w.number NULLS LAST, c.created_at
  `) as any[]

  json(res, 200, {
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      tee: c.tee,
      par: c.par,
      courseRating: Number(c.course_rating),
      slopeRating: c.slope_rating,
      lengthM: c.length_m,
      ratingSource: c.rating_source,
      notes: c.notes,
      weekNumber: c.week_number,
    })),
  })
}

interface HoleInput {
  number: number
  par: number
  strokeIndex: number
  lengthM?: number | null
}

async function create(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
  const settings = settingsOf(season)
  const input = body(req)

  const weekId = requireString(input.weekId, 'Die Woche', 40)
  const weeks = (await sql`
    SELECT id, number, starts_at, course_id, picker_id FROM weeks
    WHERE id = ${weekId} AND season_id = ${season.id}
  `) as any[]
  if (!weeks[0]) throw new HttpError(404, 'Diese Woche gibt es nicht.')
  const week = weeks[0]

  const isAdmin = user.role === 'admin'
  if (!isAdmin) {
    if (week.picker_id !== user.id) throw new HttpError(403, 'Diese Woche gehört jemand anderem.')
    const deadline = new Date(
      new Date(week.starts_at).getTime() - settings.coursePickLeadDays * 86400_000,
    )
    if (Date.now() > deadline.getTime()) {
      throw new HttpError(
        403,
        'Die Frist für die Kurswahl ist vorbei — jetzt kann nur noch der Admin eintragen.',
      )
    }
  }
  if (week.course_id && !isAdmin) {
    throw new HttpError(409, 'Für diese Woche steht der Kurs schon fest.')
  }

  const name = requireString(input.name, 'Der Kursname', 120)
  const tee = requireString(input.tee, 'Das Tee', 40)
  const lengthM = Math.round(Number(input.lengthM))
  const courseRating = optionalNumber(input.courseRating, 'Das Course Rating', 50, 85)
  const slopeRating = Math.round(Number(input.slopeRating))
  const ratingSource = ['gspro', 'api', 'estimate'].includes(String(input.ratingSource))
    ? String(input.ratingSource)
    : 'gspro'
  const notes = input.notes ? requireString(input.notes, 'Die Notiz', 400) : null

  if (!Number.isFinite(lengthM) || lengthM < settings.minLengthM || lengthM > settings.maxLengthM) {
    throw new HttpError(
      400,
      `Der Kurs muss zwischen ${settings.minLengthM} und ${settings.maxLengthM} Metern lang sein.`,
    )
  }
  if (courseRating === null) throw new HttpError(400, 'Ohne Course Rating geht es nicht.')
  if (!Number.isFinite(slopeRating) || slopeRating < 55 || slopeRating > 155) {
    throw new HttpError(400, 'Das Slope Rating muss zwischen 55 und 155 liegen.')
  }

  const holes = normaliseHoles(input.holes)
  const par = holes.reduce((sum, h) => sum + h.par, 0)

  if (!settings.allowDuplicateCourses) {
    const duplicate = (await sql`
      SELECT 1 FROM courses WHERE season_id = ${season.id} AND lower(name) = ${name.toLowerCase()}
    `) as any[]
    if (duplicate.length) {
      throw new HttpError(409, 'Dieser Kurs wurde in dieser Saison schon gespielt.')
    }
  }

  const created = (await sql`
    INSERT INTO courses (season_id, name, tee, par, course_rating, slope_rating, length_m,
                         rating_source, notes, created_by)
    VALUES (${season.id}, ${name}, ${tee}, ${par}, ${courseRating}, ${slopeRating}, ${lengthM},
            ${ratingSource}, ${notes}, ${user.id})
    RETURNING id
  `) as any[]
  const courseId = created[0].id as string

  // Alle achtzehn Löcher in einer Anweisung. Achtzehn einzelne Inserts wären
  // achtzehn Rundreisen zur Datenbank — spürbar, wenn man den Knopf drückt.
  await sql`
    INSERT INTO course_holes (course_id, number, par, stroke_index, length_m)
    SELECT ${courseId}, n, p, si, len
    FROM unnest(
      ${holes.map((h) => h.number)}::int[],
      ${holes.map((h) => h.par)}::int[],
      ${holes.map((h) => h.strokeIndex)}::int[],
      ${holes.map((h) => h.lengthM ?? null)}::int[]
    ) AS t(n, p, si, len)
  `

  await sql`UPDATE weeks SET course_id = ${courseId} WHERE id = ${weekId}`

  json(res, 201, { id: courseId, par })
}

/** Achtzehn Löcher, jeder Stroke-Index genau einmal. */
function normaliseHoles(value: unknown): HoleInput[] {
  if (!Array.isArray(value) || value.length !== 18) {
    throw new HttpError(400, 'Es braucht alle achtzehn Löcher.')
  }
  const holes: HoleInput[] = []
  const seenIndex = new Set<number>()

  value.forEach((raw, i) => {
    const par = Math.round(Number((raw as any)?.par))
    const strokeIndex = Math.round(Number((raw as any)?.strokeIndex))
    const lengthRaw = (raw as any)?.lengthM
    if (!Number.isFinite(par) || par < 3 || par > 6) {
      throw new HttpError(400, `Loch ${i + 1}: Par muss zwischen 3 und 6 liegen.`)
    }
    if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) {
      throw new HttpError(400, `Loch ${i + 1}: Der Stroke-Index muss zwischen 1 und 18 liegen.`)
    }
    if (seenIndex.has(strokeIndex)) {
      throw new HttpError(400, `Der Stroke-Index ${strokeIndex} kommt zweimal vor.`)
    }
    seenIndex.add(strokeIndex)
    holes.push({
      number: i + 1,
      par,
      strokeIndex,
      lengthM:
        lengthRaw === null || lengthRaw === undefined || lengthRaw === ''
          ? null
          : Math.round(Number(lengthRaw)),
    })
  })

  return holes
}
