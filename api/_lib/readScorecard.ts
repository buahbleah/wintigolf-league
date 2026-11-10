import Anthropic from '@anthropic-ai/sdk'
import { HttpError } from './http.js'
import {
  ScorecardError,
  toMetres,
  validateScorecard,
  type ReadCard,
  type ReadTee,
} from '../../src/core/scorecard.js'

/**
 * Eine Scorecard aus einem Bild lesen.
 *
 * Die Kursdatenbanken liefern Par, Rating und Slope, aber keinen Stroke-Index —
 * und genau der entscheidet, wo die Vorgabeschläge hingehen. Auf der Karte, die
 * GSPro und die Kursseiten zeigen, steht er in der Spalte INDEX. Also wird das
 * Bild gelesen.
 *
 * Zwei Dinge halten das ehrlich:
 *
 * Erstens wird das Ergebnis geprüft, bevor es herausgeht — achtzehn Löcher, Par
 * zwischen 3 und 6, jeder Stroke-Index genau einmal. Was daran scheitert, wird
 * abgewiesen und nicht als «wahrscheinlich richtig» durchgereicht. Lieber von
 * Hand eintippen als falsch vorausgefüllt.
 *
 * Zweitens landet alles im Formular, nicht in der Datenbank: wer den Kurs
 * einträgt, sieht jede Zahl und kann sie ändern, bevor irgendetwas gespeichert
 * wird.
 */

export const MAX_IMAGE_BYTES = 6_000_000

export type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }

export type { ReadCard, ReadTee }

const PROMPT = [
  'Das ist die Scorecard eines Golfkurses aus einem Golfsimulator.',
  '',
  'Lies die Tabelle Loch für Loch aus und ruf dafür das Werkzeug `scorecard` auf.',
  '',
  'Die Spalten heissen meist HOLE (Lochnummer), PAR und INDEX (auch HCP, SI oder',
  'Handicap genannt — der Stroke-Index, 1 bis 18, jeder Wert genau einmal).',
  'Daneben steht pro Tee eine Spalte mit der Länge.',
  '',
  'Gib in `tees` jede Tee-Spalte zurück, die auf der Karte steht: ihren Namen',
  '(White, Yellow, Gelb, Blau …), ihre Gesamtlänge aus der Zeile TOTAL und Course',
  'Rating und Slope aus der Kopfzeile über den Tee-Namen — meist als «69.8/121»',
  'geschrieben: Rating vor dem Schrägstrich, Slope dahinter.',
  '',
  'Steht für eine Spalte kein Rating da, lass das Feld weg, aber gib die Spalte',
  'trotzdem zurück. Gibt es gar keine Tee-Spalten, gib eine leere Liste zurück.',
  '',
  'Sag in `unit`, ob die Längen in Yards oder Metern stehen (steht meist als',
  'IMPERIAL oder METRIC über der Tabelle).',
  '',
  'Was du nicht sicher lesen kannst, lässt du weg. Rate nichts.',
].join('\n')

export async function readScorecard(image: ImageSource): Promise<ReadCard> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new HttpError(
      503,
      'Das Auslesen ist hier nicht eingerichtet. Trag die Karte von Hand ein — oder setz ANTHROPIC_API_KEY.',
    )
  }

  const client = new Anthropic({ apiKey: key })

  let response
  try {
    response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      system:
        'Du liest Golf-Scorecards aus Bildern. Du gibst nur zurück, was wirklich auf dem Bild steht, und rätst nie. Was unleserlich ist, lässt du weg.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: image },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
      tools: [
        {
          name: 'scorecard',
          description: 'Die ausgelesene Scorecard zurückgeben.',
          strict: true,
          input_schema: {
            type: 'object',
            properties: {
              courseName: { type: 'string', description: 'Name des Kurses, wie er oben steht.' },
              unit: { type: 'string', enum: ['yards', 'metres'] },
              tees: {
                type: 'array',
                description: 'Die Tees aus der Kopfzeile, mit Rating und Slope falls vorhanden.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    length: {
                      type: 'integer',
                      description:
                        'Gesamtlänge dieses Tees aus der Zeile TOTAL, in der Einheit aus unit. 0, wenn dort nichts Lesbares steht.',
                    },
                    courseRating: { type: 'number' },
                    slopeRating: { type: 'integer' },
                  },
                  /* Was nicht angefordert wird, kommt nicht — darum steht die
                     Länge hier, mit der 0 als ehrlichem «nicht lesbar». */
                  required: ['name', 'length'],
                  additionalProperties: false,
                },
              },
              holes: {
                type: 'array',
                description: 'Genau achtzehn Löcher, in der Reihenfolge 1 bis 18.',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'integer' },
                    par: { type: 'integer' },
                    strokeIndex: { type: 'integer', description: 'Die Spalte INDEX, HCP oder SI.' },
                    length: { type: 'integer', description: 'Länge des längsten Tees, falls lesbar.' },
                  },
                  required: ['number', 'par', 'strokeIndex'],
                  additionalProperties: false,
                },
              },
            },
            /* `tees` muss angefordert werden, sonst lässt das Werkzeug die
               Spalte einfach weg — und damit Rating und Slope, die genau dort
               stehen und sonst nirgends. */
            required: ['holes', 'unit', 'tees'],
            additionalProperties: false,
          },
        },
      ],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new HttpError(503, 'Der Schlüssel fürs Auslesen wird nicht akzeptiert.')
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpError(429, 'Gerade zu viele Anfragen. Probier es in einer Minute nochmals.')
    }
    console.error('Scorecard lesen:', err)
    throw new HttpError(502, 'Das Bild konnte nicht gelesen werden.')
  }

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'Das Bild wurde nicht ausgewertet.')
  }

  const call = response.content.find((block) => block.type === 'tool_use')
  if (!call || call.type !== 'tool_use') {
    throw new HttpError(422, 'Auf dem Bild war keine Scorecard zu erkennen.')
  }

  const parsed = call.input as {
    courseName?: string
    unit?: string
    tees?: { name: string; length?: number; courseRating?: number; slopeRating?: number }[]
    holes?: { number?: number; par?: number; strokeIndex?: number; length?: number }[]
  }

  const unit = parsed.unit === 'yards' ? 'yards' : 'metres'

  let holes
  try {
    holes = validateScorecard(parsed.holes ?? [])
  } catch (err) {
    // Eine Karte, die nicht in sich stimmt, wird nicht herausgegeben — der
    // Grund schon, damit man weiss, ob ein besseres Foto hilft.
    if (err instanceof ScorecardError) throw new HttpError(422, err.message)
    throw err
  }

  return {
    courseName: parsed.courseName?.trim() || null,
    unit,
    par: holes.reduce((sum, hole) => sum + hole.par, 0),
    holes: holes.map((hole) => ({
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      lengthM: toMetres(hole.length, unit),
    })),
    tees: (parsed.tees ?? []).map((tee) => ({
      name: tee.name,
      // Die 0 heisst «stand nicht lesbar auf der Karte» und wird wieder zu nichts.
      lengthM: toMetres(tee.length && tee.length > 0 ? tee.length : null, unit),
      courseRating: tee.courseRating ?? null,
      slopeRating: tee.slopeRating ?? null,
    })),
  }
}

/** Ein hochgeladenes Bild, als Datenadresse geschickt. */
export function imageFromDataUrl(value: unknown): ImageSource {
  const dataUrl = String(value ?? '')
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new HttpError(400, 'Das war kein lesbares Bild.')
  if (Buffer.from(match[2], 'base64').byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'Das Bild ist zu gross.')
  }
  return {
    type: 'base64',
    media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/webp',
    data: match[2],
  }
}

/**
 * Ein Bild aus dem Netz holen und selbst weiterreichen, statt nur die Adresse
 * weiterzugeben: so merken wir hier, wenn unter der Adresse gar kein Bild
 * liegt, und ein fremder Server entscheidet nicht darüber, wie gross das Bild
 * sein darf, das wir weiterschicken.
 */
export async function imageFromWeb(url: string): Promise<ImageSource> {
  if (!/^https:\/\//i.test(url)) throw new HttpError(400, 'Die Adresse muss mit https beginnen.')

  let response: Response
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'WintigolfLeague/1.0' } })
  } catch {
    throw new HttpError(502, 'Das Bild war nicht erreichbar.')
  }
  if (!response.ok) throw new HttpError(404, 'Unter dieser Adresse liegt kein Bild.')

  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/webp') {
    throw new HttpError(415, 'Das ist kein Bild, das sich lesen lässt.')
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new HttpError(404, 'Unter dieser Adresse liegt kein Bild.')
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'Das Bild ist zu gross.')

  return { type: 'base64', media_type: type, data: bytes.toString('base64') }
}
