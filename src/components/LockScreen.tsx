import { useEffect, useRef, useState } from 'react'

import type { RecentVault } from '../lib/types'

interface LockScreenProps {
  recentVaults: RecentVault[]
  pendingVaultPath: string | null
  busy: boolean
  error: string | null
  onOpenVault: () => Promise<void>
  onSelectRecent: (path: string) => void
  onClearPendingPath: () => void
  onUnlock: (password: string) => Promise<boolean>
  onCreate: (
    vaultName: string,
    password: string,
    confirmation: string,
  ) => Promise<boolean>
}

export function LockScreen({
  recentVaults,
  pendingVaultPath,
  busy,
  error,
  onOpenVault,
  onSelectRecent,
  onClearPendingPath,
  onUnlock,
  onCreate,
}: LockScreenProps) {
  const [vaultName, setVaultName] = useState('CodexVault')
  const unlockPasswordRef = useRef<HTMLInputElement | null>(null)
  const createPasswordRef = useRef<HTMLInputElement | null>(null)
  const createConfirmationRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (pendingVaultPath && unlockPasswordRef.current) {
      unlockPasswordRef.current.focus()
    }
  }, [pendingVaultPath])

  async function submitCreate() {
    const success = await onCreate(
      vaultName,
      createPasswordRef.current?.value ?? '',
      createConfirmationRef.current?.value ?? '',
    )
    if (success) {
      if (createPasswordRef.current) {
        createPasswordRef.current.value = ''
      }
      if (createConfirmationRef.current) {
        createConfirmationRef.current.value = ''
      }
    }
  }

  async function submitUnlock() {
    const success = await onUnlock(unlockPasswordRef.current?.value ?? '')
    if (success) {
      if (unlockPasswordRef.current) {
        unlockPasswordRef.current.value = ''
      }
    }
  }

  async function openVaultPicker() {
    await onOpenVault()
    if (unlockPasswordRef.current) {
      unlockPasswordRef.current.value = ''
    }
  }

  function selectRecentVault(path: string) {
    if (unlockPasswordRef.current) {
      unlockPasswordRef.current.value = ''
    }
    onSelectRecent(path)
  }

  function clearPendingPath() {
    if (unlockPasswordRef.current) {
      unlockPasswordRef.current.value = ''
    }
    onClearPendingPath()
  }

  return (
    <div className="lock-shell">
      <header className="lock-hero panel panel-prominent">
        <div>
          <span className="eyebrow">Local-first key custody</span>
          <h1>CodexVault</h1>
          <p>
            Encrypted API key storage for operators who need deliberate access, clean
            exports, and no cloud dependencies.
          </p>
        </div>
        <div className="security-grid">
          <div>
            <strong>AES-256-GCM</strong>
            <span>Full vault payload encryption at rest.</span>
          </div>
          <div>
            <strong>Argon2id</strong>
            <span>Password derivation with per-vault salt.</span>
          </div>
          <div>
            <strong>No telemetry</strong>
            <span>Nothing leaves the machine unless you copy it.</span>
          </div>
        </div>
      </header>

      <div className="lock-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Create</span>
              <h2>Create a vault file</h2>
            </div>
          </div>
          <p className="panel-note">
            Creates one encrypted `.cvault` file at a path you choose. No cloud sync, no
            account, no background service.
          </p>
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitCreate()
            }}
          >
            <label className="field">
              <span>Vault name</span>
              <input
                value={vaultName}
                onChange={(event) => setVaultName(event.target.value)}
                placeholder="CodexVault"
              />
            </label>
            <label className="field">
              <span>Master password</span>
              <input
                ref={createPasswordRef}
                type="password"
                placeholder="Choose a strong passphrase"
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                ref={createConfirmationRef}
                type="password"
                placeholder="Re-enter the passphrase"
                autoComplete="new-password"
              />
            </label>
            <button className="primary-button" disabled={busy} type="submit">
              Create vault
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Unlock</span>
              <h2>Open an existing vault</h2>
            </div>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void openVaultPicker()}
            >
              Choose `.cvault`
            </button>
          </div>
          <p className="panel-note">
            Unlock an existing vault file. Recent paths stay local to this machine only.
          </p>

          {pendingVaultPath ? (
            <form
              className="modal-form"
              onSubmit={(event) => {
                event.preventDefault()
                void submitUnlock()
              }}
            >
              <div className="selected-vault">
                <div className="selected-vault-details">
                  <strong>Selected vault</strong>
                  <code>{pendingVaultPath}</code>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={busy}
                  onClick={clearPendingPath}
                >
                  Change
                </button>
              </div>
              <label className="field">
                <span>Master password</span>
                <input
                  ref={unlockPasswordRef}
                  type="password"
                  placeholder="Enter the vault password"
                  autoComplete="current-password"
                />
              </label>
              <button
                className="primary-button"
                disabled={busy}
                type="submit"
              >
                Unlock
              </button>
            </form>
          ) : (
            <div className="empty-callout">
              Choose a `.cvault` file or use one of the recent local paths below.
            </div>
          )}

          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Recent vaults</span>
            <h2>Recent local paths</h2>
          </div>
        </div>
        {recentVaults.length === 0 ? (
          <div className="empty-callout">
            No recent paths yet. Path metadata is stored locally so you can reopen a
            vault faster; vault contents are not.
          </div>
        ) : (
          <div className="recent-list">
            {recentVaults.map((vault) => (
              <button
                key={vault.path}
                className="recent-vault"
                disabled={busy}
                onClick={() => selectRecentVault(vault.path)}
              >
                <strong>{vault.fileName}</strong>
                <span>{vault.path}</span>
                <small>Last opened {new Date(vault.lastOpenedAt).toLocaleString()}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
