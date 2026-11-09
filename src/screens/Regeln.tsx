import { navigate } from '@/state/router'
import type { LeagueData } from '@/state/league'
import { countingWeeks, ROUND_LABELS } from '@/core/settings'

/**
 * Die Regelseite.
 *
 * Sie wird nicht gepflegt, sondern aus den Einstellungen gelesen: was hier
 * steht, ist genau das, womit die App rechnet. Darum kann sie auch nicht
 * veralten — und darum gibt es keine Diskussion darüber, was abgemacht war.
 */
export function Regeln({ data }: { data: LeagueData }) {
  const settings = data.season?.settings
  if (!settings) {
    return (
      <div className="page">
        <div className="empty">
          <p>Die Regeln stehen fest, sobald eine Saison angelegt ist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Regeln</span>
        <h1>So wird gespielt</h1>
        <p className="lede">
          Direkt aus den Einstellungen der Liga — was hier steht, rechnet die App auch so.
        </p>
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Am Simulator</h3>
          <span className="chip chip--green">verbindlich</span>
        </div>
        <Rule label="Gimmie" value={`${settings.gimmieMetres} m`} />
        <Rule label="Wind" value={settings.wind} />
        <Rule label="Green Speed" value={settings.greenSpeed} />
        <Rule label="Firmness" value={settings.firmness} />
        <Rule label="Tee" value="für alle gleich, keine Änderungen" />
        <Rule label="Mulligans" value={settings.mulligans ? 'erlaubt' : 'keine'} />
        <Rule
          label="Proberunden auf dem Wochenkurs"
          value={settings.practiceRounds ? 'erlaubt' : 'nicht erlaubt'}
        />
        <Rule label="Allein spielen" value="nicht erlaubt" />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Die Woche</h3>
        </div>
        <Rule label="Spielwochen" value={`${settings.weeks}`} />
        <Rule
          label="Gewertet"
          value={`die besten ${countingWeeks(settings)} — ${settings.droppedWeeks} Streichresultate`}
        />
        <Rule label="Abgabeschluss" value={`Sonntag ${settings.deadlineHour}:59`} />
        <Rule label="Verpasste Woche" value="null Punkte" />
        <Rule label="Versuche" value="einer — es zählt die erste abgeschlossene Runde" />
        <Rule label="Runde" value="achtzehn Löcher, sonst zählt sie nicht" />
        <Rule
          label="Loch ohne Ergebnis"
          value="null Punkte, die Runde bleibt gültig"
        />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Der Kurs</h3>
        </div>
        <Rule label="Wer wählt" value="jede Woche ein anderer Spieler" />
        <Rule
          label="Frist"
          value={`${settings.coursePickLeadDays} Tag${settings.coursePickLeadDays === 1 ? '' : 'e'} vor Wochenbeginn, danach wählt der Admin`}
        />
        <Rule label="Länge" value={`${settings.minLengthM} bis ${settings.maxLengthM} Meter`} />
        <Rule
          label="Derselbe Kurs zweimal"
          value={settings.allowDuplicateCourses ? 'erlaubt' : 'nicht in derselben Saison'}
        />
        <Rule label="Rating und Slope" value="aus GSPro, notfalls aus der Kursdatenbank" />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Karte und Bestätigung</h3>
        </div>
        <Rule label="Eintragen" value="jeder seine eigene Karte, Loch für Loch" />
        <Rule label="Beleg" value="Foto des Abschlussbildschirms, Pflicht" />
        <Rule label="Zähler" value="ein Mitspieler bestätigt oder lehnt ab" />
        <Rule label="Abgelehnt" value="die Karte wird neu eingetragen, nicht nachgebessert" />
        <Rule
          label="Einzelrunde"
          value={
            settings.soloRoundsAllowed
              ? 'nur mit Freigabe des Admins'
              : 'gibt es nicht'
          }
        />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Handicap</h3>
          <span className="chip">{settings.engine === 'whs' ? 'WHS' : 'CONGU'}</span>
        </div>
        <Rule
          label="Startwert"
          value={`${Math.round(settings.startFactor * 100)} % des Handicaps draussen`}
        />
        <Rule
          label="Eichphase"
          value={`Woche 1 bis ${settings.calibrationWeeks} auf dem Startwert, Anpassung läuft ${settings.calibrationFactor}-fach`}
        />
        <Rule label="Allowance" value={`${settings.allowancePct} % des Course Handicap`} />
        {settings.engine === 'whs' ? (
          <>
            <Rule
              label="Verfahren"
              value="Score Differential je Runde, Schnitt der besten — nach WHS"
            />
            <Rule
              label="Aussergewöhnliche Runde"
              value={`ab ${settings.exceptionalMinor} Schläge besser −1.0, ab ${settings.exceptionalMajor} besser −2.0`}
            />
          </>
        ) : (
          <>
            <Rule
              label="Pufferzone"
              value={`${settings.bufferLow} bis ${settings.bufferHigh} Punkte — keine Änderung`}
            />
            <Rule
              label="Darüber und darunter"
              value={`−${settings.conguCutPerPoint} bzw. +${settings.conguRisePerPoint} pro Punkt`}
            />
          </>
        )}
        <Rule label="Grösste Bewegung" value={`±${settings.maxMovePerRound} pro Runde`} />
        <Rule
          label="Soft Cap"
          value={`höchstens ${settings.softCap} über dem tiefsten gemessenen Handicap`}
        />
        <Rule label="Grenzen" value={`${settings.minIndex} bis ${settings.maxIndex}`} />
        <Rule
          label="Gespielte Runde"
          value="behält ihr Handicap — eine Anpassung wirkt nur nach vorne"
        />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Playoffs</h3>
        </div>
        <Rule
          label="Teilnehmer"
          value={`die besten ${settings.playoffSize} der Tabelle`}
        />
        <Rule
          label="Runden"
          value={
            settings.playoffSize >= 8
              ? `${ROUND_LABELS.quarter}, ${ROUND_LABELS.semi}, ${ROUND_LABELS.final}`
              : settings.playoffSize >= 4
                ? `${ROUND_LABELS.semi}, ${ROUND_LABELS.final}`
                : ROUND_LABELS.final
          }
        />
        <Rule label="Modus" value="Matchplay über achtzehn Löcher, eine Woche pro Runde" />
        <Rule label="Vorgabe" value="voller Handicap-Unterschied nach Stroke-Index" />
        <Rule label="Kurswahl" value="der höher gesetzte Spieler" />
        <Rule label="Gleichstand nach 18" value="Stechen ab Loch 1" />
        <Rule
          label="Spiel um Platz 3"
          value={settings.thirdPlace ? 'wird gespielt' : 'gibt es nicht'}
        />
        <Rule label="Overall Winner" value="der Sieger des Finals" />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Termine</h3>
        </div>
        <Rule label="Plätze pro Termin" value={`${settings.maxPlayersPerSlot}`} />
        <Rule
          label="Dauer"
          value={`${settings.hoursPerPlayer} h pro Person, mindestens ${settings.minSlotHours} h`}
        />
        <Rule label="Überschneidungen" value="keine — es gibt einen Simulator" />
      </div>

      <button className="btn btn--quiet" onClick={() => navigate('/')}>
        Zurück zur Liga
      </button>
    </div>
  )
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
