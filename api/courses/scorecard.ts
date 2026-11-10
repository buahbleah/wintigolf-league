import type { VercelRequest, VercelResponse } from '@vercel/node'
import { body, handler, json } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { imageFromDataUrl, imageFromWeb, readScorecard } from '../_lib/readScorecard.js'

/**
 * Eine Scorecard aus einem Bild lesen — als Bildadresse oder als Foto.
 *
 *   POST { imageUrl: "https://…" }
 *   POST { image: "data:image/jpeg;base64,…" }
 *
 * Für Kurse aus der GSPro-Liste braucht es das nicht: dort kommt die Karte über
 * `/api/courses/sgt` und wird einmal für alle gelesen. Hier geht, was dort
 * fehlt — ein eigener Kurs, eine abfotografierte Karte.
 */

export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  await requireUser(req)

  const input = body(req)
  const url = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : ''
  const image = url ? await imageFromWeb(url) : imageFromDataUrl(input.image)

  json(res, 200, await readScorecard(image))
})
