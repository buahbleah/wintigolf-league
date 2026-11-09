import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Alles, was die API zurückgibt, ist JSON — auch jeder Fehler. */
export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

export function fail(res: VercelResponse, status: number, message: string) {
  json(res, status, { error: message })
}

/** Wird von Handlern geworfen, um mit einem bestimmten Status abzubrechen. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/**
 * Verpackt einen Handler so, dass ein geworfener Fehler zu einer sauberen
 * JSON-Antwort wird statt zu einem Stacktrace — und dass ein unerwarteter
 * Fehler nie nach aussen durchschlägt.
 */
export function handler(methods: string[], fn: Handler): Handler {
  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '))
      res.status(204).end()
      return
    }
    if (!methods.includes(req.method ?? '')) {
      res.setHeader('Allow', methods.join(', '))
      fail(res, 405, `Diese Adresse erwartet ${methods.join(' oder ')}.`)
      return
    }
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        fail(res, err.status, err.message)
        return
      }
      console.error('Unbehandelter API-Fehler:', err)
      fail(res, 500, 'Da ist bei uns etwas schiefgelaufen.')
    }
  }
}

export function body<T = Record<string, any>>(req: VercelRequest): T {
  const raw = req.body
  if (!raw) return {} as T
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new HttpError(400, 'Die Anfrage war nicht lesbar.')
    }
  }
  return raw as T
}

export function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} fehlt.`)
  }
  const trimmed = value.trim()
  if (trimmed.length > max) throw new HttpError(400, `${field} ist zu lang.`)
  return trimmed
}

export function optionalNumber(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(num)) throw new HttpError(400, `${field} muss eine Zahl sein.`)
  if (num < min || num > max) throw new HttpError(400, `${field} muss zwischen ${min} und ${max} liegen.`)
  return Math.round(num * 10) / 10
}

export function normaliseEmail(value: unknown): string {
  const email = requireString(value, 'Die E-Mail-Adresse', 200).toLowerCase()
  // Bewusst grosszügig: der Zweck ist, Tippfehler zu finden, nicht RFC 5322 durchzusetzen.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Das sieht nicht nach einer E-Mail-Adresse aus.')
  }
  return email
}

export function param(req: VercelRequest, name: string): string {
  const value = req.query[name]
  const single = Array.isArray(value) ? value[0] : value
  if (!single) throw new HttpError(400, `${name} fehlt in der Adresse.`)
  return single
}
