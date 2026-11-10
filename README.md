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
| `node scripts/make-icons.mjs` | App-Icons neu erzeugen |
| `npm run db:test` | Getrennte Testdatenbank anlegen und Schema einspielen |
| `node scripts/seed-test.mjs` | Testdatenbank mit drei Konten und einer Saison füllen |
| `npm run dev:test` | Dev-Server auf Port 5181 gegen die Testdatenbank |
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
| `ANTHROPIC_API_KEY` | Scorecards aus dem Bild lesen — Par und Stroke-Index je Loch |
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
  courses/      Kurs eintragen, GSPro-Kursliste, Scorecard auslesen, Kurssuche
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

## Ausprobieren, ohne etwas kaputtzumachen

Die Liga läuft auf einer echten Datenbank mit echten Konten. Zum Ausprobieren
von Verwaltungsfunktionen — Rollen, Handicaps, Saison löschen — gibt es daneben
eine getrennte Datenbank in derselben Neon-Instanz:

```bash
npm run db:test
```

```bash
node scripts/seed-test.mjs
```

```bash
npm run dev:test
```

Dann http://localhost:5181 öffnen und als `chef@example.com` mit
`testlauf-2026` anmelden. Dort darf alles gelöscht werden; die Liga merkt
nichts davon. Wieder weg mit `node scripts/make-test-db.mjs --drop`.

## Mails

Lokal wird **nichts** verschickt, sondern nur protokolliert — beim Ausprobieren
entstehen Testkonten, und jede Mail dorthin wäre eine Unzustellbarkeit auf Kosten
des Absenderrufs. `MAIL_IN_DEV=1` hebt das auf.

## Stand

Alle sieben Etappen stehen:

1. Gerüst, Registrierung mit Liga-Code, Anmelden, Passwort zurücksetzen, Profil
2. Saison mit allen Einstellungen, Wochen, Kurszuteilung, Kurseingabe
3. Score Loch für Loch, Beleg-Foto, Zähler, Bestätigen und Ablehnen
4. Tabelle mit Streichresultaten, Handicap-Motor, Power Rankings, Spielerseite
5. Terminplaner, Clubhaus, Mitteilungen, Abzeichen, Deadline-Erinnerung
6. Playoffs im Matchplay, Siegerseite, Handicap-Übernahme in die nächste Saison
7. Regelseite, Verlaufsgrafik, Loch-für-Loch-Vergleich, App-Icons, Deployment

Die App läuft: **https://wintigolf-league.vercel.app** — jeder Push auf `main`
deployt neu. Einrichtung und Betrieb stehen in [DEPLOY.md](DEPLOY.md).

### Wie das Handicap gerechnet wird

Der Motor rechnet nach jeder Bestätigung die **ganze** Saison des Spielers neu
durch, Runde für Runde. Das kostet ein paar Abfragen mehr und ist jede davon
wert: das Ergebnis hängt nicht davon ab, in welcher Reihenfolge Bestätigungen
eintreffen, eine Korrektur rechnet sauber durch, und ein zweiter Lauf ändert
nichts. Was dabei nie wandert: das Handicap, mit dem eine Runde gespielt wurde —
das steht in der Runde selbst.

`POST /api/admin/recompute` ist derselbe Lauf für alle, von Hand ausgelöst (in
der App unter Einstellungen).

### Wie ein Kurs in die Woche kommt

Wer die Woche wählt, sucht den Platz in der Kursliste des [Simulator Golf
Tour](https://simulatorgolftour.com/courses) — dort stehen die Plätze, die es in
GSPro wirklich gibt. Ein Klick, und aus der Scorecard des Kurses kommen Par und
Stroke-Index für alle achtzehn Löcher, dazu Rating, Slope und Länge pro Tee.

Der Stroke-Index ist der Grund für diesen Umweg: keine Kursdatenbank gibt ihn
her, und er entscheidet, auf welche Löcher die Vorgabeschläge fallen. Auf der
Scorecard steht er — also wird sie gelesen.

Dabei bleibt dreierlei bewusst so:

- **Die Liste liegt bei uns**, einen Tag lang. Die Suche klopft nicht bei jedem
  Tastendruck an einem fremden Server an, und fällt der aus, zeigt die App die
  Liste von gestern statt gar keine.
- **Jede Karte wird einmal gelesen.** Das Ergebnis liegt in der Datenbank; wer in
  Woche sieben denselben Kurs wählt, bekommt ihn sofort.
- **Geprüft wird, bevor etwas ankommt.** Achtzehn Löcher, Par zwischen 3 und 6,
  jeder Stroke-Index genau einmal — was daran scheitert, wird abgewiesen statt
  als «wahrscheinlich richtig» durchgereicht. Und alles landet im Formular, nicht
  in der Datenbank: jede Zahl ist sichtbar und änderbar, bevor gespeichert wird.

Steht ein Platz nicht in der Liste, geht es weiterhin über ein Bild der
Scorecard — als Adresse oder als Foto — oder ganz von Hand.
