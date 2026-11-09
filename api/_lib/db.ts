import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

/**
 * Postgres über HTTP. Genau das macht eine Datenbank aus einer kurzlebigen
 * serverlosen Funktion heraus überhaupt brauchbar — kein Verbindungspool, der
 * beim nächsten Kaltstart ins Leere läuft.
 *
 * Der Client entsteht beim ersten Zugriff, nicht beim Import: Tests und CI
 * importieren diese Module ohne DATABASE_URL, und ein Import soll nie das sein,
 * was fehlschlägt.
 */

let client: NeonQueryFunction<false, false> | null = null

function connection(): NeonQueryFunction<false, false> {
  if (client) return client
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL ist auf diesem Deployment nicht gesetzt.')
  client = neon(url)
  return client
}

export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  (connection() as any)(strings, ...values)) as unknown as NeonQueryFunction<false, false>

export type Row = Record<string, any>

/** Erste Zeile oder null — der Normalfall bei einer Suche über den Primärschlüssel. */
export async function one<T = Row>(rows: Promise<unknown>): Promise<T | null> {
  const result = (await rows) as T[]
  return result[0] ?? null
}
