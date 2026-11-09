/**
 * Der einzige Ort, der mit dem Server spricht.
 *
 * Die Sitzung hängt an einem httpOnly-Cookie, darum reicht `credentials:
 * same-origin` — es gibt keinen Token, den die App selber verwalten müsste.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
  } catch {
    throw new ApiError(0, 'Keine Verbindung. Bist du online?')
  }

  const text = await response.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError(response.status, 'Der Server hat etwas Unerwartetes geantwortet.')
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'Das hat nicht geklappt.')
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, payload?: unknown) => request<T>('POST', path, payload ?? {}),
  patch: <T>(path: string, payload: unknown) => request<T>('PATCH', path, payload),
  del: <T>(path: string) => request<T>('DELETE', path),
}
