import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handler, json } from '../_lib/http.js'
import { destroySession } from '../_lib/auth.js'

export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  await destroySession(req, res)
  json(res, 200, { ok: true })
})
