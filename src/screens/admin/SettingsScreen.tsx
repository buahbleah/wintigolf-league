import { useState } from 'react'
import { api, ApiError } from '@/net/api'
import { SETTING_GROUPS, type LeagueSettings, type SettingField } from '@/core/settings'
import type { Season } from '@/state/league'

/**
 * Die Einstellungen der Liga.
 *
 * Ein Formular, erzeugt aus der Beschreibung in `settings.ts` — eine neue
 * Schraube braucht hier keine Zeile. Was nach dem Saisonstart Gespieltes
 * umdeuten würde, ist gesperrt und sagt auch, warum.
 */
export function SettingsScreen({ season, onSaved }: { season: Season; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => ({
    ...(season.settings as unknown as Record<string, string | number | boolean>),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const started = season.startedAt !== null

  function set(key: keyof LeagueSettings, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/api/seasons/${season.id}`, { settings: values })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Verwaltung</span>
        <h1>Einstellungen</h1>
        <p className="lede">
          Jede Änderung wirkt nach vorne. Gespielte Runden behalten das Handicap, mit dem sie
          gespielt wurden.
        </p>
      </div>

      {SETTING_GROUPS.map((group) => (
        <div className="card stack" key={group.title}>
          <div className="card-title">
            <h3>{group.title}</h3>
          </div>
          {group.note && <p className="muted small">{group.note}</p>}
          {group.fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key]}
              locked={started && field.lockedAfterStart === true}
              onChange={(value) => set(field.key, value)}
            />
          ))}
        </div>
      ))}

      {error && <div className="notice notice--error">{error}</div>}
      {saved && <div className="notice notice--ok">Gespeichert.</div>}

      <button className="btn btn--primary btn--block" onClick={save} disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        Einstellungen speichern
      </button>
    </div>
  )
}

function Field({
  field,
  value,
  locked,
  onChange,
}: {
  field: SettingField
  value: string | number | boolean | undefined
  locked: boolean
  onChange: (value: string | number | boolean) => void
}) {
  if (field.kind === 'switch') {
    return (
      <label className={`switch-row${locked ? ' is-locked' : ''}`}>
        <span>
          {field.label}
          {field.hint && <span className="hint">{field.hint}</span>}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={Boolean(value)}
          disabled={locked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    )
  }

  if (field.kind === 'choice') {
    return (
      <div className="field">
        <label htmlFor={field.key}>{field.label}</label>
        <select
          id={field.key}
          value={String(value ?? '')}
          disabled={locked}
          onChange={(e) => {
            const picked = field.choices?.find((c) => String(c.value) === e.target.value)
            onChange(picked ? picked.value : e.target.value)
          }}
        >
          {field.choices?.map((choice) => (
            <option key={String(choice.value)} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </select>
        {field.hint && <span className="hint">{field.hint}</span>}
        {locked && <span className="hint">Steht fest, seit die Saison gestartet ist.</span>}
      </div>
    )
  }

  return (
    <div className="field">
      <label htmlFor={field.key}>{field.label}</label>
      <input
        id={field.key}
        value={String(value ?? '')}
        disabled={locked}
        inputMode={field.kind === 'text' ? undefined : 'decimal'}
        onChange={(e) =>
          onChange(field.kind === 'text' ? e.target.value : e.target.value.replace(',', '.'))
        }
      />
      {field.hint && <span className="hint">{field.hint}</span>}
      {locked && <span className="hint">Steht fest, seit die Saison gestartet ist.</span>}
    </div>
  )
}
