# Online stellen

Die App ist fertig gebaut und liegt auf GitHub. Zum Livegang fehlt nur noch das
Vercel-Projekt — und das muss aus deinem Konto heraus angelegt werden: der
Zugang, über den ich mit Vercel spreche, darf lesen und verwalten, aber keine
Projekte anlegen (403). Die Vercel-CLI ist auf diesem Rechner nicht installiert.

Es sind drei Schritte, zusammen etwa fünf Minuten.

## 1. Projekt importieren

Auf [vercel.com/new](https://vercel.com/new) das Repository **wintigolf-league**
importieren. Vercel erkennt Vite von selbst; `vercel.json` im Repo setzt schon:

- Build: `npm run build`, Ausgabe nach `dist`
- Funktionen aus `api/`, Region **fra1** (Frankfurt, also nah an der Datenbank)
- Cron: `/api/cron/reminders`, täglich um 18:00 Schweizer Zeit

Nichts davon musst du im Dashboard einstellen.

## 2. Die vier Variablen eintragen

Unter *Settings → Environments → Production* (und, wenn du magst, auch *Preview*):

| Variable | Woher |
| --- | --- |
| `DATABASE_URL` | derselbe Wert wie in deiner `.env.local` |
| `BREVO_API_KEY` | derselbe Wert wie in deiner `.env.local` |
| `BREVO_SENDER_EMAIL` | `info@crossfitgleis10.ch` |
| `GOLF_COURSE_API_KEY` | derselbe Wert wie in deiner `.env.local` |

`BREVO_SENDER_NAME` und `GOLF_COURSE_API_DAILY_BUDGET` sind optional, die App
hat vernünftige Vorgaben.

Danach einmal *Redeploy*, damit die Funktionen die Variablen sehen. Das ist der
Schritt, den man gerne vergisst: ein Deployment, das vor den Variablen lief,
kennt sie nicht.

## 3. Brevo freischalten

Beim Testen hat Brevo die Mail mit **401 — unrecognised IP address** abgelehnt.
Auf deinem Konto ist die IP-Beschränkung für API-Schlüssel aktiv, und
Vercel-Funktionen haben keine feste IP. In Brevo unter *Einstellungen →
Sicherheit → Authorised IPs* die Beschränkung abschalten (oder den Schlüssel
davon ausnehmen), sonst geht keine einzige Mail raus.

Prüfen lässt sich das danach so: als Admin `/api/cron/reminders` aufrufen — die
Antwort sagt, wie viele Erinnerungen verschickt wurden und an wen.

## Das Schema

Es liegt schon in der Datenbank `wintigolf`; `npm run db:apply` lässt sich
jederzeit wiederholen, ohne Schaden anzurichten. Nach einem Update, das neue
Tabellen oder Spalten bringt, muss es einmal laufen — lokal gegen dieselbe
Datenbank genügt, es ist dieselbe, mit der die Produktion spricht.

## Der erste Start

1. Du registrierst dich zuerst: das **allererste Konto braucht keinen Liga-Code
   und wird Admin**.
2. Saison anlegen, Startmontag wählen, Wochen und Spielerzahl setzen.
3. Den Liga-Code an die Gruppe geben — oder den Link
   `https://<deine-adresse>/#/beitreten/<CODE>`.
4. Warten, bis alle ihr Handicap draussen eingetragen haben, und erst dann die
   Saison **starten**. Mit dem Start frieren die Handicaps ein.
5. Wochen an die Spieler verteilen, damit jeder weiss, wann er den Kurs wählt.

## Wenn etwas nicht geht

- **Weisse Seite, Konsole zeigt 404 auf `/api/...`** — die Funktionen wurden
  nicht gebaut. Prüfen, ob `api/` im Repo liegt und `vercel.json` mitdeployed
  wurde.
- **`DATABASE_URL ist auf diesem Deployment nicht gesetzt`** — Variable fehlt
  oder das Deployment lief vor ihr. Redeploy.
- **Mails kommen nicht an** — fast immer die IP-Sperre aus Schritt 3. Der
  Fehlschlag steht in der Tabelle `mail_log` in der Spalte `error`.
- **Kurssuche sagt, sie sei nicht eingerichtet** — `GOLF_COURSE_API_KEY` fehlt.
  Rating und Slope lassen sich immer auch von Hand eintragen.
