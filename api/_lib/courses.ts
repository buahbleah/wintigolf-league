import { sql } from './db.js'

/**
 * Einen Kurs wegräumen, an dem nichts mehr hängt.
 *
 * Wird ein Kurs ersetzt oder aus einer Woche genommen, bliebe seine Zeile
 * sonst für immer stehen — unsichtbar, aber nicht folgenlos: die Liga erlaubt
 * standardmässig keinen Kurs zweimal pro Saison, und ein vergessener Eintrag
 * würde den eigenen Platz für den Rest der Saison sperren.
 *
 * Gelöscht wird nur, woran wirklich niemand mehr hängt. Zeigt noch eine Runde,
 * eine Woche oder ein Match darauf, bleibt er stehen — die drei Bedingungen
 * sind die Bremse, nicht die Zierde. Die achtzehn Löcher gehen mit ihm.
 */
export async function removeOrphanCourse(courseId: string | null | undefined): Promise<void> {
  if (!courseId) return
  await sql`
    DELETE FROM courses c
    WHERE c.id = ${courseId}
      AND NOT EXISTS (SELECT 1 FROM rounds r WHERE r.course_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM weeks w WHERE w.course_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.course_id = c.id)
  `
}
