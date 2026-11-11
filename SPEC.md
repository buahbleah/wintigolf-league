# Wintigolf League — Spezifikation

Eine Liga für Indoor-Golf am Simulator (Garmin R50 mit GSPro). Zehn Wochen,
jede Woche ein anderer Kurs, Netto-Stableford gegen ein Handicap, das sich nach
jeder Runde bewegt. Danach Playoffs im Matchplay.

Dieses Dokument ist die Abmachung. Was hier steht, wird gebaut; was hier nicht
steht, wird nicht gebaut, ohne dass es vorher hier landet. Die Regelseite der
App speist sich aus denselben Werten.

---

## 1. Saison und Wochen

- Eine Saison hat **10 Spielwochen**, danach die Playoffs.
- Jede Woche hat ein eigenes Start- und Enddatum, frei verschiebbar. Pausen
  über Feiertage sind damit möglich, und der Admin kann die ganze Liga
  **pausieren** — alle Folgewochen rücken automatisch nach.
- Standardfenster: **Montag 00:00 bis Sonntag 23:59** (Europe/Zurich). Der
  Upload muss innerhalb des Fensters passieren.
- Der Admin kann **Beginn und Einreichetermin jeder Woche auf die Minute
  setzen** und die ganze Saison auf einen anderen Start verschieben — auch
  wenn sie schon läuft. Zwei Wochen dürfen sich dabei nie überlappen, und ein
  Fenster lässt keine Karte draussen, die schon abgegeben wurde.
- **Verpasste Woche = 0 Punkte.** Gewertet werden die **besten 8 von 10**
  Wochen, die zwei schlechtesten fallen weg.
- Eine Runde zählt nur über **18 Löcher**. Neun-Loch-Runden gibt es nicht.
- **Ein Versuch pro Woche.** Es zählt die erste abgeschlossene Runde.
- Wer in einer Woche später dazustösst, bekommt für die verpassten Wochen 0
  Punkte und spielt normal mit. Der Admin kann einen Nachzügler alternativ
  **ab einer bestimmten Woche** aufnehmen, dann zählen nur die restlichen.
- Scheidet jemand mitten in der Saison aus, markiert der Admin ihn als
  ausgeschieden: er verschwindet aus Tabelle und Playoff-Seeding, bleibt aber
  im Archiv mit allen gespielten Runden erhalten.

## 2. Kurse

- Jeder Spieler bestimmt **eine** Woche den Kurs. Welche Woche wem gehört,
  legt der Admin fest.
- **Deadline für die Kurswahl:** Sonntag 23:59 vor der eigenen Woche. Wer nicht
  liefert, dem wählt der Admin einen Kurs.
- Ein Kurs darf **pro Saison nur einmal** vorkommen.
- Pro Kurs wird erfasst: Name, gespieltes Tee, **Par und Stroke-Index für alle
  18 Löcher**, **Course Rating**, **Slope Rating** und die Länge in Metern.
- **Kurslänge muss zwischen 5200 und 6300 Metern liegen** (Grenzen im
  Admin-Menü änderbar). Die App lehnt einen Kurs ausserhalb ab.
- Course Rating und Slope kommen aus GSPro. Fehlen sie dort, holt die App sie
  über die GolfCourseAPI für den echten Kurs. Gibt es auch dort nichts, muss
  ein anderer Kurs gewählt werden — eine Woche ohne echtes Rating wird nicht
  gespielt.
- Sobald eine Woche freigeschaltet ist, sehen alle die Kursvorschau mit Par,
  Stroke-Index und den verbindlichen Einstellungen.

## 3. Spielregeln am Simulator

Diese Werte stehen in der App bei jeder Woche und sind im Admin-Menü änderbar:

| Regel | Wert |
| --- | --- |
| Gimmie-Distanz | 1.2 m |
| Tee-Positionen | keine Änderungen, alle spielen dasselbe Tee |
| Wind | aus |
| Green Speed / Firmness | Standard |
| Mulligans | keine |
| Proberunden auf dem Wochenkurs | nicht erlaubt |
| Alleine spielen | nicht erlaubt (siehe 4) |

Ein Loch, das nicht fertig gespielt wird, gibt **0 Punkte**. Wird eine Runde
abgebrochen, geben alle Restlöcher 0 Punkte — die Runde zählt trotzdem als
eingereicht.

## 4. Runde einreichen und bestätigen

- Gespielt wird **immer zu zweit bis zu viert**, nie allein.
- Jeder trägt seine **eigene** Karte ein, Loch 1 bis 18, und lädt ein Foto des
  GSPro-Abschlussbildschirms hoch. Ein Foto genügt, wenn alle Namen darauf
  sichtbar sind.
- Beim Eintragen zeigt die App die Brutto-Summe gross an, damit Tippfehler
  sofort auffallen. Die Karte ist als Entwurf speicherbar, man kann also schon
  während der Runde Loch für Loch eintragen.
- Jeder wählt beim Einreichen einen **Zähler** aus den Mitspielern. Der
  bekommt die Karte samt Foto zur Freigabe.
- **Abgelehnt** heisst: die Karte muss neu eingetragen werden.
- Solange niemand bestätigt hat, erscheint die Runde als **unbestätigt** — sie
  zählt vorläufig in der Tabelle und ist als unbestätigt markiert. Der Admin
  kann anhand des Fotos selber bestätigen.
- Findet jemand in einer Woche keinen Mitspieler, gibt es 0 Punkte. Der Admin
  kann im Einzelfall eine **Einzelrunde freigeben** und sie selber bestätigen.
- Korrigiert der Admin eine bestätigte Karte, wird das sichtbar als **"vom
  Admin korrigiert"** markiert und das Handicap neu gerechnet.
- Alle Mitglieder sehen jede Karte Loch für Loch samt Foto.

## 5. Netto-Stableford

```
Course Handicap  = Handicap Index x (Slope / 113) + (Course Rating - Par)
Playing Handicap = Course Handicap x 100 %
```

Die Schläge werden nach **Stroke-Index** auf die Löcher verteilt. Punkte pro
Loch nach Netto-Ergebnis: Doppelbogey oder schlechter 0 · Bogey 1 · Par 2 ·
Birdie 3 · Eagle 4 · Albatros 5 · darüber 6.

Wer exakt auf sein Handicap spielt, kommt auf 36 Punkte — unabhängig vom Par
des Kurses. Deshalb ist das die Bezugsgrösse für alles Weitere.

## 6. Handicap

Jeder Spieler hat zwei Werte: sein **Outdoor-Handicap** (selber eingetragen,
für alle sichtbar, reine Information) und sein **Indoor-Handicap** (das, auf
das gespielt wird).

- Das Indoor-Handicap startet bei **50 % des Outdoor-Handicaps**.
- Bearbeitbar ist es, bis die **erste Runde der Saison startet**. Danach
  ändert es nur noch das System; der Admin kann eingreifen, sichtbar markiert.
- Jede Runde speichert fest, mit welchem Handicap sie gespielt wurde. Eine
  spätere Änderung rechnet nie eine alte Runde um.
- **Woche 1 bis 3 ist Eichphase**: gespielt wird auf dem Startwert, die Wochen
  zählen ganz normal für die Tabelle.
- **Ab Woche 4** gilt das gemessene Indoor-Handicap, nach jeder Runde neu.
- Eine **gespielte** Runde passt das Handicap an, auch wenn sie später als
  Streichresultat aus der Tabelle fällt. Eine **verpasste** Woche ändert
  nichts. Playoff-Runden zählen fürs Handicap mit.

### Verfahren A — WHS Score Differentials (Standard)

Nach jeder Runde:

```
Differential = (113 / Slope) x (korrigiertes Brutto - Course Rating)
```

Das korrigierte Brutto deckelt jedes Loch bei **Netto-Doppelbogey**, ein
Totalschaden verzerrt also nichts. Das Indoor-Handicap ist der Schnitt der
tiefsten Differentials nach der WHS-Tabelle für kurze Historien:

| Runden | verwendet | Korrektur |
| --- | --- | --- |
| 3 | tiefstes 1 | −2.0 |
| 4 | tiefstes 1 | −1.0 |
| 5 | tiefstes 1 | — |
| 6 | Schnitt der 2 tiefsten | −1.0 |
| 7–8 | Schnitt der 2 tiefsten | — |
| 9–11 | Schnitt der 3 tiefsten | — |
| 12–14 | Schnitt der 4 tiefsten | — |
| 15–16 | Schnitt der 5 tiefsten | — |
| 17–18 | Schnitt der 6 tiefsten | — |
| 19 | Schnitt der 7 tiefsten | — |
| 20 | Schnitt der 8 tiefsten | — |

Schutzschrauben:

- maximal **±2.0** Bewegung pro Runde
- **Soft Cap**: das Handicap steigt nie mehr als **3.0** über den Tiefstwert
  der Saison
- **Exceptional Score Reduction**: ein Differential 7.0 bis 9.9 besser als das
  aktuelle Handicap gibt zusätzlich −1.0, ab 10.0 besser −2.0
- Grenzen: maximal 54.0, minimal −4.0

### Verfahren B — CONGU symmetrisch (Alternative)

Pufferzone 35 bis 37 Punkte, keine Änderung. Über 37: −0.2 pro Punkt darüber.
Unter 35: +0.2 pro Punkt darunter. Gedeckelt bei ±2.0 pro Runde.

Beide Verfahren sind eingebaut und im Admin-Menü umschaltbar, inklusive aller
Zahlenwerte. Eine Umschaltung wirkt nur auf künftige Runden.

## 7. Tabelle und Rankings

- **Saisontabelle**: Summe der Netto-Stableford-Punkte der besten 8 Wochen.
- **Gleichstand**: bessere Einzelrunde → mehr Wochensiege → tieferes
  Indoor-Handicap.
- **Wochenansicht**: Rangliste der Woche, wer noch nicht abgegeben hat, wer
  noch einen Mitspieler sucht, Countdown bis zur Deadline.
- **Power Rankings**: Form der letzten 3 Runden, Schnitt, Konstanz, Trendpfeil.
- **Verlaufsgrafik** der Tabelle über die Wochen, **Handicap-Verlauf** pro
  Spieler, **Loch-für-Loch-Vergleich** der Woche.
- **Profil**: Name, Foto, Indoor- und Outdoor-Handicap, Schlägerdistanzen,
  Schnitt, beste Runde, Eagles, Birdies, Badges, alle gespielten Runden.

## 8. Playoffs

- Nach Woche 10. Teilnehmerzahl im Admin-Menü: **Top 4** oder **Top 8**.
- Seeding nach Saisontabelle, Bracket so, dass 1 und 2 sich frühestens im
  Finale treffen (1–8, 4–5, 3–6, 2–7).
- **Eine Woche pro Playoff-Runde**, gleiche Deadline-Logik.
- Gespielt wird **Matchplay** über 18 Löcher. Beide tragen ihre eigene Karte
  ein und bestätigen sich gegenseitig wie immer; das Resultat (z. B. "3&2")
  **rechnet die App Loch für Loch selber aus**.
- Schläge nach **vollem Handicap-Unterschied** (100 %), verteilt nach
  Stroke-Index.
- Den Kurs wählt der **höher gesetzte** Spieler, dieselben Kursregeln wie in
  der Saison.
- Gleichstand nach 18 Löchern: **Stechen ab Loch 1**.
- Kommt ein Match nicht zustande, kommt der höher gesetzte Spieler weiter; der
  Admin kann das überschreiben.
- **Spiel um Platz 3**: Schalter im Admin-Menü.
- **Overall Winner** ist der Sieger des Finals. Der Erste der Grundsaison wird
  separat als **Grundsaison-Sieger** ausgewiesen.

## 9. Konten und Rollen

- Registrierung mit **E-Mail und Passwort**, Zugang nur mit **Liga-Code**
  (Einladungslink `…/join/<code>`).
- **Passwort vergessen** per Mail.
- **Admin** darf: Saison und Wochen anlegen und verschieben, Liga pausieren,
  Kurse zuteilen und korrigieren, Karten bestätigen und korrigieren,
  Handicaps setzen, Einzelrunden freigeben, Spieler ausschliessen, alle
  Einstellungen ändern, weitere Admins ernennen.
- Erster Admin: `info@crossfitgleis10.ch`.

## 10. Terminplaner

- Jeder kann einen Termin ausschreiben (Datum, Uhrzeit, Spielwoche), die
  anderen sagen zu — damit steht der Flight.
- **Maximal 4 Zusagen** pro Termin, der fünfte sieht "voll".
- **Slotdauer** = eine Stunde pro zugesagter Person, mindestens 2 Stunden,
  pro Termin von Hand korrigierbar. Überlappende Termine werden blockiert, es
  gibt nur einen Simulator.
- Export als **.ics** und als Google-Calendar-Link.
- Eine eingereichte Runde hängt am Termin — im Nachhinein ist sichtbar, wer
  wann mit wem gespielt hat.

## 11. Clubhaus

- **Forum**: jeder kann ein Thema eröffnen und antworten.
- Automatisch ein Thread pro Spielwoche.
- **Kommentare und Emoji-Reaktionen direkt an jeder Karte.**
- Keine privaten 1:1-Nachrichten.

## 12. Badges

Eagle · Hole-in-One · Wochensieg (mit Zähler) · grösster Handicap-Cut · beste
Runde der Saison · Albatros · erste Runde · alle 10 Wochen gespielt.

## 13. Benachrichtigungen

- **Mail über Brevo** bei: Erinnerung um 06:00, wenn der Abgabeschluss in
  weniger als 24 Stunden ist und die Karte noch fehlt; "eine Karte wartet auf
  deine Bestätigung"; "deine Karte wurde abgelehnt"; Passwort zurücksetzen.
  Eine Einladungsmail gibt es nicht — eingeladen wird über den Beitrittslink.
- **In der App** ein Benachrichtigungs-Center (Glocke mit Badge) für Zusagen,
  Bestätigungen, Kommentare und Forumsantworten.
- Echte Push-Nachrichten später, wenn gewünscht.

## 14. Technik

- React + Vite, TypeScript, als PWA installierbar, Dark Mode als Standard.
- API als Vercel Node Functions, Daten in **Neon Postgres** (eigene Datenbank
  `wintigolf` im bestehenden Neon-Projekt).
- Screenshots in **Vercel Blob**.
- Mails über die **Brevo-API**, Absender `info@crossfitgleis10.ch`
  (Domain ist authentifiziert und verifiziert).
- Course Rating und Slope notfalls über die **GolfCourseAPI**, Ergebnisse
  werden dauerhaft in Postgres gespeichert, damit das Tageskontingent reicht.
- Deutsch (Schweizer Schreibweise), Zeitzone Europe/Zurich.
- Repository: `github.com/buahbleah/wintigolf-league` (privat), Deployment
  über Vercel bei jedem Push auf `main`.
- Der angezeigte Name der App und der Liga ist jederzeit in den Einstellungen
  änderbar.
- Saison 2 lässt sich als neue Saison starten; Saison 1 bleibt als Archiv
  erhalten, das Indoor-Handicap wird als Startwert übernommen.

## 15. Gestaltung

Eine **eigene Identität**, bewusst getrennt von CrossFit Gleis 10 — keine
Gym-Farben, kein Gym-Logo.

- **Dunkel als Grundton**, nicht nur als Option: gespielt wird in einem
  abgedunkelten Raum, und die App wird dort am Simulator bedient.
- **Fairway-Grün als einziger Akzent**, sparsam eingesetzt — für das, was
  gerade zählt: der eigene Rang, der bestätigte Status, der Knopf, der dran
  ist.
- Grosse Zahlen, ruhige Flächen, wenig Linien. Eine Scorecard muss man mit
  einem Blick lesen können, nicht studieren.
- Score-Eingabe für den Daumen: grosse Felder, schnelles Tippen, automatisch
  weiter zum nächsten Loch.

## 16. Etappen

1. Gerüst, Login, Registrierung mit Liga-Code, Profile
2. Saison, Wochen, Kurswahl und Kursdaten
3. Score-Eingabe, Foto-Upload, Bestätigung durch den Zähler
4. Netto-Stableford, Handicap-Motor, Tabelle, Power Rankings
5. Terminplaner, Clubhaus, Benachrichtigungen, Badges
6. Playoffs, Siegerseite, Archiv
7. Design-Feinschliff und Deployment
