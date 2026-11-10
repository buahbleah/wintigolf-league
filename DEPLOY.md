# Online

Die App läuft: **https://wintigolf-league.vercel.app**

## Wie es eingerichtet ist

| | |
| --- | --- |
| Vercel-Projekt | `wintigolf-league` im Team *Phil's projects* |
| Repository | `buahbleah/wintigolf-league`, verbunden — jeder Push auf `main` deployt |
| Region der Funktionen | `fra1`, Frankfurt, damit sie neben der Datenbank stehen |
| Datenbank | Neon, Datenbank `wintigolf` im Projekt *fairway-games* |
| Cron | `/api/cron/reminders`, täglich 18:00 Schweizer Zeit |
| Variablen | `DATABASE_URL`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `GOLF_COURSE_API_KEY`, `GOLF_COURSE_API_DAILY_BUDGET`, `ANTHROPIC_API_KEY` — gesetzt für Production und Preview |

Alles davon steht in `vercel.json` oder in den Projekt-Variablen; im Dashboard
muss nichts nachgestellt werden.

## Was noch offen ist: Brevo

Beim Testen hat Brevo die Mail mit **401 — unrecognised IP address** abgelehnt.
Auf deinem Konto ist die IP-Beschränkung für API-Schlüssel aktiv, und
Vercel-Funktionen haben keine feste IP. In Brevo unter *Einstellungen →
Sicherheit → Authorised IPs* die Beschränkung abschalten oder den Schlüssel
davon ausnehmen — sonst geht keine einzige Mail raus: keine Erinnerung vor der
Deadline, keine Bestätigungsanfrage, kein Passwort-Reset.

Prüfen: als Admin `/api/cron/reminders` aufrufen. Die Antwort sagt, wie viele
Erinnerungen verschickt wurden und an wen. Was fehlschlägt, steht in der Tabelle
`mail_log` in der Spalte `error`.

## Der erste Start

1. **Du registrierst dich zuerst.** Das allererste Konto braucht keinen
   Liga-Code und wird Admin.
2. Saison anlegen: Startmontag, Wochen, Streichresultate, Spielerzahl.
3. Den Liga-Code weitergeben, oder gleich den Link
   `https://wintigolf-league.vercel.app/#/beitreten/<CODE>`.
4. Warten, bis alle ihr Handicap draussen eingetragen haben — und **erst dann
   die Saison starten**. Mit dem Start frieren die Handicaps ein.
5. Unter *Wochen* jedem Spieler seine Woche zuteilen.

## Später

**Neu deployen** passiert von selbst bei jedem Push auf `main`. Von Hand:

```bash
vercel deploy --prod
```

**Eine Variable ändern:**

```bash
vercel env rm DATABASE_URL production
```

```bash
vercel env add DATABASE_URL production
```

Danach einmal neu deployen, sonst arbeitet die laufende Version noch mit dem
alten Wert.

**Nach einem Update, das die Datenbank ändert**, einmal lokal gegen dieselbe
Datenbank laufen lassen — es ist dieselbe, mit der die Produktion spricht:

```bash
npm run db:apply
```

## Wenn etwas nicht geht

- **Weisse Seite, 404 auf `/api/...`** — die Funktionen wurden nicht gebaut.
  `vercel logs` zeigt den Build.
- **`DATABASE_URL ist auf diesem Deployment nicht gesetzt`** — das Deployment
  lief vor der Variablen. Neu deployen.
- **Mails kommen nicht an** — fast immer die IP-Sperre oben.
- **Kurssuche sagt, sie sei nicht eingerichtet** — `GOLF_COURSE_API_KEY` fehlt.
- **Das Auslesen sagt, es sei nicht eingerichtet** — `ANTHROPIC_API_KEY` fehlt.
  Rating und Slope lassen sich immer auch von Hand eintragen.
