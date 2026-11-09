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
| `node scripts/seed-demo.mjs` | Testsaison mit zwei Konten anlegen (nur Entwicklung) |
| `node scripts/seed-playoffs.mjs --force` | Fertige Grundsaison mit vier Spielern, um Playoffs zu testen |
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
| `MAIL_IN_DEV` | Auf `1` setzen, wenn lokal wirklich Mails rausgehen sollen |

Die Belege (Fotos der Abschlussbildschirme) liegen in der Datenbank, nicht in
einem öffentlichen Speicher: so braucht die App keinen weiteren Dienst, und ein
Beleg ist nur mit angemeldeter Sitzung zu sehen statt über eine Adresse, die man
weitergeben kann.

## Wie der Code liegt

```
api/            Vercel-Funktionen
  _lib/         Datenbank, Sitzungen, Passwörter, Mails, Request-Hilfen
  auth/         registrieren, anmelden, abmelden, me, Passwort zurücksetzen
  profile/      eigenes Profil ändern
  seasons/      Saison anlegen und verwalten, Wochen, Spieler
  weeks/        Kurszuteilung pro Woche
  courses/      Kurs eintragen, Kurssuche mit Cache und Tagesbudget
  rounds/       Karte anfangen, eintragen, Beleg, abgeben, bestätigen
  standings/    Tabelle und Power Rankings
  playoffs/     Bracket setzen und ansehen
  matches/      Stechen, kampflos, Admin-Entscheid
  slots/        Termine am Simulator
  topics/       Clubhaus
  notifications/ Glocke
  cron/         Erinnerung vor der Deadline
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

## Mails

Lokal wird **nichts** verschickt, sondern nur protokolliert — beim Ausprobieren
entstehen Testkonten, und jede Mail dorthin wäre eine Unzustellbarkeit auf Kosten
des Absenderrufs. `MAIL_IN_DEV=1` hebt das auf.

## Stand

Etappe 1 bis 6 stehen:

1. Gerüst, Registrierung mit Liga-Code, Anmelden, Passwort zurücksetzen, Profil
2. Saison mit allen Einstellungen, Wochen, Kurszuteilung, Kurseingabe
3. Score Loch für Loch, Beleg-Foto, Zähler, Bestätigen und Ablehnen
4. Tabelle mit Streichresultaten, Handicap-Motor, Power Rankings, Spielerseite
5. Terminplaner, Clubhaus, Mitteilungen, Abzeichen, Deadline-Erinnerung
6. Playoffs im Matchplay, Siegerseite, Handicap-Übernahme in die nächste Saison

Offen ist Etappe 7 — Design-Feinschliff und Deployment. Der Etappenplan steht am
Ende von [SPEC.md](SPEC.md).

### Wie das Handicap gerechnet wird

Der Motor rechnet nach jeder Bestätigung die **ganze** Saison des Spielers neu
durch, Runde für Runde. Das kostet ein paar Abfragen mehr und ist jede davon
wert: das Ergebnis hängt nicht davon ab, in welcher Reihenfolge Bestätigungen
eintreffen, eine Korrektur rechnet sauber durch, und ein zweiter Lauf ändert
nichts. Was dabei nie wandert: das Handicap, mit dem eine Runde gespielt wurde —
das steht in der Runde selbst.

`POST /api/admin/recompute` ist derselbe Lauf für alle, von Hand ausgelöst (in
der App unter Einstellungen).
