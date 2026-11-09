/**
 * Lässt die Vercel-Funktionen aus api/ im Vite-Dev-Server laufen.
 *
 * Auf Vercel ist jede Datei unter api/ eine eigene Funktion. Lokal gibt es die
 * nicht, darum übersetzt dieses Plugin eingehende /api/-Anfragen in dieselben
 * Handler: Pfad auf Datei abbilden (inklusive [id]-Segmenten), Modul über Vite
 * laden und Request/Response so aufbereiten, wie @vercel/node sie übergibt.
 *
 * Es läuft nur im Dev-Server. Im Build ist davon nichts enthalten.
 */
import { existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_DIR = resolve(process.cwd(), 'api')

/** Findet die Handler-Datei zu einem Pfad wie /api/rounds/abc/hole. */
function resolveRoute(pathname: string): { file: string; params: Record<string, string> } | null {
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const params: Record<string, string> = {}
  let dir = API_DIR

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const last = i === segments.length - 1

    if (last) {
      const direct = join(dir, `${segment}.ts`)
      if (existsSync(direct)) return { file: direct, params }
      const asIndex = join(dir, segment, 'index.ts')
      if (existsSync(asIndex)) return { file: asIndex, params }
    } else if (existsSync(join(dir, segment))) {
      dir = join(dir, segment)
      continue
    }

    // Kein wörtlicher Treffer: nach einem [param]-Segment suchen.
    const entries = existsSync(dir) ? readdirSync(dir) : []
    const dynamicDir = entries.find((e) => e.startsWith('[') && !e.endsWith('.ts'))
    const dynamicFile = entries.find((e) => e.startsWith('[') && e.endsWith('.ts'))

    if (last && dynamicFile) {
      params[dynamicFile.slice(1, -4).replace(']', '')] = segment
      return { file: join(dir, dynamicFile), params }
    }
    if (dynamicDir) {
      params[dynamicDir.slice(1, -1)] = segment
      dir = join(dir, dynamicDir)
      if (last) {
        const index = join(dir, 'index.ts')
        if (existsSync(index)) return { file: index, params }
      }
      continue
    }
    return null
  }
  return null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
    req.on('error', failed)
  })
}

export function devApi(): Plugin {
  return {
    name: 'wintigolf-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        const route = resolveRoute(url.pathname)
        if (!route) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Keine API-Route für ${url.pathname}.` }))
          return
        }

        try {
          const mod = await server.ssrLoadModule(route.file)
          const fn = mod.default
          if (typeof fn !== 'function') throw new Error(`${route.file} exportiert keinen Handler.`)

          const query: Record<string, string> = { ...route.params }
          url.searchParams.forEach((value, key) => {
            query[key] = value
          })

          const raw = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? '' : await readBody(req)
          let parsed: unknown = raw
          const type = String(req.headers['content-type'] ?? '')
          if (raw && type.includes('application/json')) {
            try {
              parsed = JSON.parse(raw)
            } catch {
              parsed = raw
            }
          }

          // Die paar Response-Methoden, die @vercel/node zusätzlich mitbringt.
          const vres = res as ServerResponse & Record<string, any>
          vres.status = (code: number) => {
            res.statusCode = code
            return vres
          }
          vres.send = (data: any) => {
            if (data === undefined || data === null) res.end()
            else if (Buffer.isBuffer(data) || typeof data === 'string') res.end(data)
            else {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
            }
            return vres
          }
          vres.json = (data: any) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
            return vres
          }

          const vreq = req as IncomingMessage & Record<string, any>
          vreq.query = query
          vreq.body = parsed
          vreq.cookies = Object.fromEntries(
            String(req.headers.cookie ?? '')
              .split(';')
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part) => {
                const i = part.indexOf('=')
                return [part.slice(0, i), decodeURIComponent(part.slice(i + 1))]
              }),
          )

          await fn(vreq, vres)
        } catch (err) {
          server.config.logger.error(`API ${url.pathname}: ${(err as Error).message}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
          }
          res.end(JSON.stringify({ error: (err as Error).message }))
        }
      })
    },
  }
}
