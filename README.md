# Wintigolf League

Indoor-Golfliga am Simulator (Garmin R50 mit GSPro). Zehn Wochen, jede Woche ein
anderer Kurs, Netto-Stableford gegen ein Handicap, das sich nach jeder Runde
bewegt. Danach Playoffs im Matchplay.

Die Spielregeln stehen in **[SPEC.md](SPEC.md)** — das ist die Abmachung, aus
der auch die Regelseite der App gespeist wird.

## Loslegen

```bash
npm install
npm run dev
```

Dann http://localhost:5180 öffnen. Die App ist für ein Handy gebaut, also am
besten in einem schmalen Fenster anschauen.

| Befehl | Was er tut |
| --- | --- |
| `npm run dev` | Dev-Server, inklusive der API aus `api/` |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run db:apply` | Schema aus `db/schema.sql` einspielen (idempotent) |
| `npm test` | Tests |
| `npm run typecheck` | TypeScript prüfen |

## Zugangsdaten

Lokal in `.env.local` (von Git ausgeschlossen), auf Vercel in den
Projekt-Variablen. `.env.example` zeigt, welche es gibt.

| Variable | Wofür |
| --- | --- |
| `DATABASE_URL` | Neon-Postgres, Datenbank `wintigolf` |
| `BREVO_API_KEY` | Mails: Einladung, Reminder, Bestätigungen, Passwort |
| `GOLF_COURSE_API_KEY` | Course Rating und Slope, wenn GSPro sie nicht hergibt |
| `BLOB_READ_WRITE_TOKEN` | Screenshots in Vercel Blob (setzt Vercel selber) |

## Wie der Code liegt

```
api/            Vercel-Funktionen
  _lib/         Datenbank, Sitzungen, Passwörter, Mails, Request-Hilfen
  auth/         registrieren, anmelden, abmelden, me, Passwort zurücksetzen
  profile/      eigenes Profil ändern
db/schema.sql   das ganze Schema
dev/            lässt die API im Vite-Dev-Server laufen
src/
  core/         Typen und Rechenwerk
  design/       Token, Grundlagen, Bausteine, Screens — keine Farbe sonstwo
  net/          der einzige Ort, der mit dem Server spricht
  state/        Sitzung und Router
  ui/           Marke und Zeichensystem
  screens/      die Screens
```

## Der erste Start

Das **allererste Konto** braucht keinen Liga-Code und wird automatisch Admin —
zu diesem Zeitpunkt gibt es noch keine Saison, die einen Code ausgeben könnte.
Jedes weitere Konto kommt nur mit gültigem Liga-Code hinein.

## Stand

Etappe 1 steht: Gerüst, Registrierung mit Liga-Code, Anmelden, Passwort
zurücksetzen, Profil mit Handicap und Schlägerdistanzen. Als Nächstes kommt
Etappe 2 — Saison, Wochen, Kurswahl und Kursdaten. Der Etappenplan steht am Ende
von [SPEC.md](SPEC.md).
