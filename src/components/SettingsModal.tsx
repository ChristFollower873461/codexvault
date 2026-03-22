import { useEffect, useState } from 'react'

import type { VaultSettings } from '../lib/types'

interface SettingsModalProps {
  settings: VaultSettings
  onClose: () => void
  onSave: (settings: VaultSettings) => Promise<void>
}

export function SettingsModal({
  settings,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  function updateNumber<K extends keyof VaultSettings>(field: K, value: string) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) {
      return
    }
    setDraft((current) => ({
      ...current,
      [field]: parsed,
    }))
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card modal-card-small" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Vault settings</span>
            <h2>Session controls</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="panel-note">
          These settings are stored inside the encrypted vault and travel with encrypted
          backups.
        </p>

        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave(draft)
          }}
        >
          <label className="field">
            <span>Idle auto-lock (minutes)</span>
            <input
              type="number"
              min={1}
              max={240}
              step={1}
              value={draft.idleLockMinutes}
              onChange={(event) => updateNumber('idleLockMinutes', event.target.value)}
            />
            <small className="field-hint">Locks the vault after local inactivity.</small>
          </label>

          <label className="field">
            <span>Clipboard clear timeout (seconds)</span>
            <input
              type="number"
              min={5}
              max={300}
              step={1}
              value={draft.clipboardClearSeconds}
              onChange={(event) =>
                updateNumber('clipboardClearSeconds', event.target.value)
              }
            />
            <small className="field-hint">
              Clears copied values if the clipboard still matches the last copy.
            </small>
          </label>

          <label className="field">
            <span>Reveal auto-hide (seconds)</span>
            <input
              type="number"
              min={3}
              max={120}
              step={1}
              value={draft.revealAutoHideSeconds}
              onChange={(event) =>
                updateNumber('revealAutoHideSeconds', event.target.value)
              }
            />
            <small className="field-hint">
              Re-masks revealed secrets and plaintext previews after the timeout.
            </small>
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Save vault settings
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
