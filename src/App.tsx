import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'

import './App.css'
import { EntryEditorModal } from './components/EntryEditorModal'
import { LockScreen } from './components/LockScreen'
import { SettingsModal } from './components/SettingsModal'
import { StatusPill } from './components/StatusPill'
import { useIdleLock } from './hooks/useIdleLock'
import {
  clearClipboardText,
  pickBackupFile,
  pickExistingVaultFile,
  pickNewVaultFile,
  readClipboardText,
} from './lib/desktop'
import { deriveFilterOptions, filterEntries } from './lib/filters'
import type {
  AppSnapshot,
  EntryStatus,
  EntryUpsertInput,
  ExportFormat,
  VaultSettings,
  VaultEntryRecord,
} from './lib/types'
import * as vaultApi from './lib/vaultApi'

interface ExportPreviewState {
  format: ExportFormat
  content: string
}

interface OpenClawReportState {
  generatedAt: string
  selectionPolicy: {
    statusPriority: string[]
    dedupe: string
    revokedBehavior: string
  }
  selected: Array<{
    provider: string
    envVarName: string
    entryId: string
    entryName: string
    status: string
    environment: string
    usedOldFallback: boolean
  }>
  skipped: Array<{
    envVarName: string
    reason: string
    entryId: string
    entryName: string
    provider: string
    status: string
    environment: string
  }>
}

interface OpenClawReviewState {
  targetFormat: 'openClaw' | 'openClawBundle'
  targetIds: string[]
  targetKey: string
  report: OpenClawReportState
}

interface FiltersState {
  search: string
  provider: string
  environment: string
  tag: string
  status: EntryStatus | 'all'
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const exportOptions = [
  {
    format: 'env' as const,
    label: '.env block',
    description: 'Quoted environment assignments for shell and dotenv workflows.',
    audience: 'general' as const,
  },
  {
    format: 'genericJson' as const,
    label: 'Generic JSON',
    description: 'Structured JSON for operator tooling and scripts.',
    audience: 'general' as const,
  },
  {
    format: 'openClaw' as const,
    label: 'OpenClaw env',
    description:
      'Deterministic OpenClaw env output. Prefers active keys, falls back to old, excludes revoked.',
    audience: 'openclaw' as const,
  },
  {
    format: 'openClawBundle' as const,
    label: 'OpenClaw bundle JSON',
    description:
      'OpenClaw-ready bundle with env map, selected entry metadata, and skipped-entry diagnostics.',
    audience: 'openclaw' as const,
  },
  {
    format: 'providerSnippet' as const,
    label: 'Provider snippet',
    description: 'Minimal provider-focused JSON with env name, key, and model context.',
    audience: 'general' as const,
  },
]

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not recorded'
  }

  return timestampFormatter.format(new Date(value))
}

function errorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'The requested action could not be completed.'
}

function hasActiveFilters(filters: FiltersState) {
  return (
    filters.search.trim().length > 0 ||
    filters.provider !== 'all' ||
    filters.environment !== 'all' ||
    filters.tag !== 'all' ||
    filters.status !== 'all'
  )
}

function formatExportLabel(format: ExportFormat) {
  return exportOptions.find((option) => option.format === format)?.label ?? format
}

function parseOpenClawReport(content: string): OpenClawReportState | null {
  try {
    const parsed = JSON.parse(content) as {
      format?: unknown
      generatedAt?: unknown
      selectionPolicy?: unknown
      providers?: unknown
      skipped?: unknown
    }

    if (parsed.format !== 'codexvault.openclaw.bundle') {
      return null
    }
    if (typeof parsed.generatedAt !== 'string') {
      return null
    }

    const selectionPolicy = parsed.selectionPolicy as {
      statusPriority?: unknown
      dedupe?: unknown
      revokedBehavior?: unknown
    }
    if (
      !selectionPolicy ||
      !Array.isArray(selectionPolicy.statusPriority) ||
      selectionPolicy.statusPriority.some((item) => typeof item !== 'string') ||
      typeof selectionPolicy.dedupe !== 'string' ||
      typeof selectionPolicy.revokedBehavior !== 'string'
    ) {
      return null
    }

    const selected = Array.isArray(parsed.providers)
      ? parsed.providers
          .map((provider) => {
            const value = provider as {
              provider?: unknown
              envVarName?: unknown
              entryId?: unknown
              entryName?: unknown
              status?: unknown
              environment?: unknown
              usedOldFallback?: unknown
            }
            if (
              typeof value.provider !== 'string' ||
              typeof value.envVarName !== 'string' ||
              typeof value.entryId !== 'string' ||
              typeof value.entryName !== 'string' ||
              typeof value.status !== 'string' ||
              typeof value.environment !== 'string' ||
              typeof value.usedOldFallback !== 'boolean'
            ) {
              return null
            }
            return {
              provider: value.provider,
              envVarName: value.envVarName,
              entryId: value.entryId,
              entryName: value.entryName,
              status: value.status,
              environment: value.environment,
              usedOldFallback: value.usedOldFallback,
            }
          })
          .filter(
            (
              item,
            ): item is {
              provider: string
              envVarName: string
              entryId: string
              entryName: string
              status: string
              environment: string
              usedOldFallback: boolean
            } => Boolean(item),
          )
      : []

    const skipped = Array.isArray(parsed.skipped)
      ? parsed.skipped
          .map((entry) => {
            const value = entry as {
              envVarName?: unknown
              reason?: unknown
              entryId?: unknown
              entryName?: unknown
              provider?: unknown
              status?: unknown
              environment?: unknown
            }
            if (
              typeof value.envVarName !== 'string' ||
              typeof value.reason !== 'string' ||
              typeof value.entryId !== 'string' ||
              typeof value.entryName !== 'string' ||
              typeof value.provider !== 'string' ||
              typeof value.status !== 'string' ||
              typeof value.environment !== 'string'
            ) {
              return null
            }
            return {
              envVarName: value.envVarName,
              reason: value.reason,
              entryId: value.entryId,
              entryName: value.entryName,
              provider: value.provider,
              status: value.status,
              environment: value.environment,
            }
          })
          .filter(
            (
              item,
            ): item is {
              envVarName: string
              reason: string
              entryId: string
              entryName: string
              provider: string
              status: string
              environment: string
            } => Boolean(item),
          )
      : []

    return {
      generatedAt: parsed.generatedAt,
      selectionPolicy: {
        statusPriority: selectionPolicy.statusPriority,
        dedupe: selectionPolicy.dedupe,
        revokedBehavior: selectionPolicy.revokedBehavior,
      },
      selected,
      skipped,
    }
  } catch {
    return null
  }
}

const initialFilters: FiltersState = {
  search: '',
  provider: 'all',
  environment: 'all',
  tag: 'all',
  status: 'all',
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pendingVaultPath, setPendingVaultPath] = useState<string | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [exportScope, setExportScope] = useState<'selected' | 'filtered'>(
    'selected',
  )
  const [showSettings, setShowSettings] = useState(false)
  const [openClawReview, setOpenClawReview] = useState<OpenClawReviewState | null>(
    null,
  )
  const [revealedSecret, setRevealedSecret] = useState<{
    entryId: string
    value: string
  } | null>(null)
  const [exportPreview, setExportPreview] = useState<ExportPreviewState | null>(
    null,
  )
  const clipboardTimerRef = useRef<number | null>(null)

  const session = snapshot?.session ?? null
  const entries = session?.entries ?? []
  const isVaultEmpty = entries.length === 0
  const deferredSearch = useDeferredValue(filters.search)
  const filterOptions = deriveFilterOptions(entries)
  const filteredEntries = filterEntries(entries, {
    ...filters,
    search: deferredSearch,
  })
  const filtersActive = hasActiveFilters(filters)

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ?? null
  const selectedEntryDetails =
    selectedEntry ?? entries.find((entry) => entry.id === selectedEntryId) ?? null
  const effectiveExportScope =
    exportScope === 'filtered' || !selectedEntryDetails ? 'filtered' : 'selected'
  const exportIds =
    effectiveExportScope === 'filtered'
      ? filteredEntries.map((entry) => entry.id)
      : selectedEntryDetails
        ? [selectedEntryDetails.id]
        : []
  const exportTargetKey = `${effectiveExportScope}:${exportIds.join(',')}`

  function applySnapshot(nextSnapshot: AppSnapshot) {
    startTransition(() => {
      setSnapshot(nextSnapshot)
    })
  }

  async function scheduleClipboardClear(
    expectedValue: string,
    timeoutSeconds: number,
  ) {
    if (clipboardTimerRef.current) {
      window.clearTimeout(clipboardTimerRef.current)
    }

    clipboardTimerRef.current = window.setTimeout(async () => {
      try {
        const currentValue = await readClipboardText()
        if (currentValue === expectedValue) {
          await clearClipboardText()
        }
      } catch {
        // Ignore clipboard races.
      }
    }, timeoutSeconds * 1000)
  }

  useEffect(() => {
    void (async () => {
      try {
        const initialSnapshot = await vaultApi.getAppSnapshot()
        applySnapshot(initialSnapshot)
      } catch (loadError) {
        setError(errorMessage(loadError))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!flash) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setFlash(null)
    }, 3200)

    return () => window.clearTimeout(timerId)
  }, [flash])

  useEffect(() => {
    if (!session) {
      setSelectedEntryId(null)
      setRevealedSecret(null)
      setExportPreview(null)
      setOpenClawReview(null)
      return
    }

    if (filteredEntries.length === 0) {
      setSelectedEntryId(null)
      setRevealedSecret(null)
      return
    }

    if (selectedEntryId && filteredEntries.some((entry) => entry.id === selectedEntryId)) {
      return
    }

    setSelectedEntryId(filteredEntries[0].id)
    setRevealedSecret(null)
  }, [filteredEntries, selectedEntryId, session])

  useEffect(() => {
    if (!openClawReview) {
      return
    }

    if (openClawReview.targetKey !== exportTargetKey) {
      setOpenClawReview(null)
    }
  }, [exportTargetKey, openClawReview])

  useEffect(() => {
    if (!revealedSecret || !session) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setRevealedSecret((current) =>
        current?.entryId === revealedSecret.entryId ? null : current,
      )
    }, session.settings.revealAutoHideSeconds * 1000)

    return () => window.clearTimeout(timerId)
  }, [revealedSecret, session])

  useEffect(() => {
    if (!exportPreview || !session) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setExportPreview((current) =>
        current?.content === exportPreview.content ? null : current,
      )
    }, session.settings.revealAutoHideSeconds * 1000)

    return () => window.clearTimeout(timerId)
  }, [exportPreview, session])

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) {
        window.clearTimeout(clipboardTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const clearSensitiveUiState = () => {
      setRevealedSecret(null)
      setExportPreview(null)
      setOpenClawReview(null)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearSensitiveUiState()
      }
    }

    window.addEventListener('blur', clearSensitiveUiState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', clearSensitiveUiState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function handleLock() {
    if (!session) {
      return
    }

    try {
      const nextSnapshot = await vaultApi.lockVault()
      applySnapshot(nextSnapshot)
      setPendingVaultPath(session.currentPath)
      setRevealedSecret(null)
      setExportPreview(null)
      setFlash('Vault locked.')
    } catch (lockError) {
      setError(errorMessage(lockError))
    }
  }

  useIdleLock({
    enabled: Boolean(session),
    timeoutMs: (session?.settings.idleLockMinutes ?? 0) * 60 * 1000,
    onLock: () => {
      void handleLock()
    },
  })

  async function perform<T>(work: () => Promise<T>) {
    setBusy(true)
    setError(null)

    try {
      return await work()
    } catch (workError) {
      setError(errorMessage(workError))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenVault() {
    const selectedPath = await pickExistingVaultFile()
    if (selectedPath) {
      setPendingVaultPath(selectedPath)
      setError(null)
    }
  }

  async function handleCreateVault(
    vaultName: string,
    password: string,
    confirmation: string,
  ) {
    if (password !== confirmation) {
      setError('The passwords did not match.')
      return false
    }

    const targetPath = await pickNewVaultFile(vaultName)
    if (!targetPath) {
      return false
    }

    const nextSnapshot = await perform(() =>
      vaultApi.createVault(targetPath, vaultName, password),
    )
    if (!nextSnapshot) {
      return false
    }

    applySnapshot(nextSnapshot)
    setPendingVaultPath(nextSnapshot.session?.currentPath ?? null)
    setFlash('Vault created and unlocked.')
    return true
  }

  async function handleUnlock(password: string) {
    if (!pendingVaultPath) {
      setError('Choose a `.cvault` file to unlock.')
      return false
    }

    const nextSnapshot = await perform(() =>
      vaultApi.unlockVault(pendingVaultPath, password),
    )
    if (!nextSnapshot) {
      return false
    }

    applySnapshot(nextSnapshot)
    setFlash('Vault unlocked.')
    return true
  }

  async function handleEntrySubmit(input: EntryUpsertInput) {
    const nextSnapshot = await perform(() => vaultApi.upsertEntry(input))
    if (!nextSnapshot) {
      return
    }

    applySnapshot(nextSnapshot)
    setEditorMode(null)
    setFlash(input.id ? 'Entry updated.' : 'Entry added.')
  }

  async function handleDeleteEntry(entry: VaultEntryRecord) {
    if (
      !window.confirm(
        `Delete "${entry.name}" from this vault?\n\nThis removes the entry from the current vault file.`,
      )
    ) {
      return
    }

    const nextSnapshot = await perform(() => vaultApi.deleteEntry(entry.id))
    if (!nextSnapshot) {
      return
    }

    applySnapshot(nextSnapshot)
    setFlash('Entry deleted.')
  }

  async function handleMarkRotated(entry: VaultEntryRecord) {
    const nextSnapshot = await perform(() => vaultApi.markEntryRotated(entry.id))
    if (!nextSnapshot) {
      return
    }

    applySnapshot(nextSnapshot)
    setFlash('Rotation timestamp updated.')
  }

  async function handleRevealSecret(entry: VaultEntryRecord) {
    if (revealedSecret?.entryId === entry.id) {
      setRevealedSecret(null)
      return
    }

    const secret = await perform(() => vaultApi.revealSecret(entry.id))
    if (typeof secret !== 'string') {
      return
    }

    setRevealedSecret({ entryId: entry.id, value: secret })
    setExportPreview(null)
  }

  async function handleCopySecret(entry: VaultEntryRecord) {
    const nextSnapshot = await perform(() => vaultApi.copySecret(entry.id))
    if (!nextSnapshot) {
      return
    }

    applySnapshot(nextSnapshot)
    setFlash(`Copied secret for ${entry.name}.`)

    try {
      const clipboardValue = await readClipboardText()
      await scheduleClipboardClear(
        clipboardValue,
        nextSnapshot.session?.settings.clipboardClearSeconds ?? 30,
      )
    } catch {
      // Ignore clipboard read failures.
    }
  }

  async function copyExportNow(format: ExportFormat, ids: string[]) {
    const nextSnapshot = await perform(() => vaultApi.copyExport(ids, format))
    if (!nextSnapshot) {
      return false
    }

    applySnapshot(nextSnapshot)
    setFlash(`Copied ${formatExportLabel(format)}.`)

    try {
      const clipboardValue = await readClipboardText()
      await scheduleClipboardClear(
        clipboardValue,
        nextSnapshot.session?.settings.clipboardClearSeconds ?? 30,
      )
    } catch {
      // Ignore clipboard read failures.
    }

    return true
  }

  async function openOpenClawReview(targetFormat: 'openClaw' | 'openClawBundle') {
    const reportContent = await perform(() =>
      vaultApi.previewExport(exportIds, 'openClawBundle'),
    )
    if (typeof reportContent !== 'string') {
      return
    }

    const report = parseOpenClawReport(reportContent)
    if (!report) {
      setError('OpenClaw selection report could not be generated.')
      return
    }

    setOpenClawReview({
      targetFormat,
      targetIds: [...exportIds],
      targetKey: exportTargetKey,
      report,
    })
  }

  async function handlePreviewExport(format: ExportFormat) {
    const content = await perform(() => vaultApi.previewExport(exportIds, format))
    if (typeof content !== 'string') {
      return
    }

    setExportPreview({ format, content })
  }

  async function handleCopyExport(format: ExportFormat) {
    if (format === 'openClaw' || format === 'openClawBundle') {
      await openOpenClawReview(format)
      return
    }

    await copyExportNow(format, exportIds)
  }

  async function handleConfirmOpenClawCopy() {
    if (!openClawReview) {
      return
    }

    const copied = await copyExportNow(
      openClawReview.targetFormat,
      openClawReview.targetIds,
    )
    if (copied) {
      setOpenClawReview(null)
    }
  }

  async function handleBackup() {
    if (!session) {
      return
    }

    const targetPath = await pickBackupFile(session.vaultName)
    if (!targetPath) {
      return
    }

    const savedPath = await perform(() => vaultApi.exportEncryptedBackup(targetPath))
    if (typeof savedPath !== 'string') {
      return
    }

    setFlash(`Encrypted backup written to ${savedPath}.`)
  }

  async function handleSaveSettings(settings: VaultSettings) {
    const nextSnapshot = await perform(() => vaultApi.setVaultSettings(settings))
    if (!nextSnapshot) {
      return
    }

    applySnapshot(nextSnapshot)
    setShowSettings(false)
    setFlash('Vault settings updated.')
  }

  if (loading) {
    return (
      <main className="app-shell centered-screen">
        <div className="panel loading-card">Opening CodexVault…</div>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="app-shell">
        <LockScreen
          busy={busy}
          error={error}
          onClearPendingPath={() => setPendingVaultPath(null)}
          onCreate={handleCreateVault}
          onOpenVault={handleOpenVault}
          onSelectRecent={setPendingVaultPath}
          onUnlock={handleUnlock}
          pendingVaultPath={pendingVaultPath}
          recentVaults={snapshot?.recentVaults ?? []}
        />
      </main>
    )
  }

  const activeCount = entries.filter((entry) => entry.status === 'active').length
  const revokedCount = entries.filter((entry) => entry.status === 'revoked').length

  return (
    <main className="app-shell">
      <header className="topbar panel">
        <div>
          <span className="eyebrow">Encrypted local vault</span>
          <h1>{session.vaultName}</h1>
          <div className="path-line">
            <span>Vault file</span>
            <code>{session.currentPath}</code>
          </div>
        </div>

        <div className="topbar-metrics">
          <div>
            <strong>{entries.length}</strong>
            <span>entries</span>
          </div>
          <div>
            <strong>{activeCount}</strong>
            <span>active</span>
          </div>
          <div>
            <strong>{revokedCount}</strong>
            <span>revoked</span>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="secondary-button" disabled={busy} onClick={handleBackup}>
            Write encrypted backup
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setShowSettings(true)}
          >
            Vault settings
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => setEditorMode('create')}
          >
            New entry
          </button>
          <button className="ghost-button" disabled={busy} onClick={() => void handleLock()}>
            Lock vault
          </button>
        </div>
      </header>

      {error ? (
        <p className="error-banner global-banner" role="alert">
          {error}
        </p>
      ) : null}
      {flash ? (
        <p className="flash-banner" role="status">
          {flash}
        </p>
      ) : null}

      <div className="workspace-grid">
        <aside className="panel filters-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Filters</span>
              <h2>Search metadata</h2>
            </div>
          </div>
          <p className="panel-note">
            Search and filters operate on metadata only. Secrets are never included.
          </p>

          <label className="field">
            <span>Search</span>
            <input
              value={filters.search}
              onChange={(event) =>
                startTransition(() => {
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                })
              }
              placeholder="Name, provider, notes, tags, environment"
            />
          </label>

          <label className="field">
            <span>Provider</span>
            <select
              value={filters.provider}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  provider: event.target.value,
                }))
              }
            >
              <option value="all">All providers</option>
              {filterOptions.providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Environment</span>
            <select
              value={filters.environment}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  environment: event.target.value,
                }))
              }
            >
              <option value="all">All environments</option>
              {filterOptions.environments.map((environment) => (
                <option key={environment} value={environment}>
                  {environment}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tag</span>
            <select
              value={filters.tag}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  tag: event.target.value,
                }))
              }
            >
              <option value="all">All tags</option>
              {filterOptions.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as FiltersState['status'],
                }))
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="old">Old</option>
              <option value="revoked">Revoked</option>
            </select>
          </label>

          <button
            className="ghost-button"
            onClick={() => setFilters(initialFilters)}
          >
            Clear filters
          </button>

          <div className="panel-note panel-note-strong">
            Showing {filteredEntries.length} of {entries.length}{' '}
            {entries.length === 1 ? 'entry' : 'entries'}.
          </div>
        </aside>

        <section className="panel list-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Entries</span>
              <h2>
                {isVaultEmpty
                  ? 'No entries yet'
                  : filtersActive
                    ? `${filteredEntries.length} of ${entries.length} entries`
                    : `${entries.length} entries`}
              </h2>
            </div>
            {selectedEntryDetails ? (
              <button
                className="secondary-button"
                onClick={() => setEditorMode('edit')}
              >
                Edit selected
              </button>
            ) : null}
          </div>

          {isVaultEmpty ? (
            <div className="empty-state">
              <h3>Vault is ready for its first entry</h3>
              <p>
                Add a provider credential, env var name, notes, and tags. Secrets stay
                masked until you explicitly reveal or copy them.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => setEditorMode('create')}
              >
                Add first entry
              </button>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="empty-state">
              <h3>No matching entries</h3>
              <p>
                No entries match the current metadata filters. Clear the filters or
                pick a different provider, tag, or environment.
              </p>
              <button className="secondary-button" onClick={() => setFilters(initialFilters)}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="entry-list">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  className={`entry-card ${
                    entry.id === selectedEntryDetails?.id ? 'entry-card-active' : ''
                  }`}
                  onClick={() => {
                    setSelectedEntryId(entry.id)
                    setRevealedSecret(null)
                    setExportPreview(null)
                  }}
                >
                  <div className="entry-card-header">
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.provider}</span>
                    </div>
                    <StatusPill status={entry.status} />
                  </div>
                  <div className="entry-card-subline">
                    <code>{entry.envVarName}</code>
                    <span>{entry.environment || 'General scope'}</span>
                  </div>
                  <div className="chip-row">
                    {entry.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <small>{entry.notes || `Updated ${formatTimestamp(entry.updatedAt)}`}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel details-panel">
          {!selectedEntryDetails ? (
            <div className="empty-state">
              {isVaultEmpty ? (
                <>
                  <h3>Details, secret actions, and exports appear here</h3>
                  <p>
                    Once the vault has entries, this pane becomes the place for reveal,
                    copy, rotation tracking, and export work.
                  </p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => setEditorMode('create')}
                  >
                    Add first entry
                  </button>
                </>
              ) : (
                <>
                  <h3>No entry selected</h3>
                  <p>
                    Choose an entry from the list to inspect metadata, copy the secret,
                    or generate an export snippet.
                  </p>
                  <button className="secondary-button" onClick={() => setFilters(initialFilters)}>
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Details</span>
                  <h2>{selectedEntryDetails.name}</h2>
                  <p className="panel-note">
                    {selectedEntryDetails.provider}
                    {selectedEntryDetails.environment
                      ? ` · ${selectedEntryDetails.environment}`
                      : ' · general scope'}
                  </p>
                </div>
                <StatusPill status={selectedEntryDetails.status} />
              </div>

              <div className="details-actions">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void handleCopySecret(selectedEntryDetails)}
                >
                  Copy secret
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void handleRevealSecret(selectedEntryDetails)}
                >
                  {revealedSecret?.entryId === selectedEntryDetails.id
                    ? 'Hide secret'
                    : 'Reveal secret'}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void handleMarkRotated(selectedEntryDetails)}
                >
                  Mark rotated
                </button>
                <button
                  className="ghost-button danger-button"
                  disabled={busy}
                  onClick={() => void handleDeleteEntry(selectedEntryDetails)}
                >
                  Delete
                </button>
              </div>

              <div className="secret-panel">
                <div>
                  <span className="eyebrow">Secret value</span>
                  <code className="secret-value">
                    {revealedSecret?.entryId === selectedEntryDetails.id
                      ? revealedSecret.value
                      : '••••••••••••••••••••••••'}
                  </code>
                </div>
                <small>
                  Masked by default. Reveal values auto-hide after{' '}
                  {session.settings.revealAutoHideSeconds} seconds. Clipboard clears
                  after {session.settings.clipboardClearSeconds} seconds if unchanged.
                </small>
              </div>

              <div className="metadata-grid">
                <div>
                  <span>Provider</span>
                  <strong>{selectedEntryDetails.provider}</strong>
                </div>
                <div>
                  <span>Env var</span>
                  <code>{selectedEntryDetails.envVarName}</code>
                </div>
                <div>
                  <span>Environment</span>
                  <strong>{selectedEntryDetails.environment || 'Unspecified'}</strong>
                </div>
                <div>
                  <span>Model family</span>
                  <strong>{selectedEntryDetails.modelFamily || 'Unspecified'}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{formatTimestamp(selectedEntryDetails.createdAt)}</strong>
                </div>
                <div>
                  <span>Last used</span>
                  <strong>{formatTimestamp(selectedEntryDetails.lastUsedAt)}</strong>
                </div>
                <div>
                  <span>Rotated</span>
                  <strong>{formatTimestamp(selectedEntryDetails.rotatedAt)}</strong>
                </div>
                <div>
                  <span>Last tested</span>
                  <strong>{formatTimestamp(selectedEntryDetails.lastTestedAt)}</strong>
                </div>
              </div>

              <div className="details-columns">
                <div>
                  <span className="eyebrow">Models</span>
                  <div className="chip-row">
                    {selectedEntryDetails.models.length === 0 ? (
                      <span className="chip chip-muted">No model list</span>
                    ) : (
                      selectedEntryDetails.models.map((model) => (
                        <span key={model} className="chip">
                          {model}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="eyebrow">Tags</span>
                  <div className="chip-row">
                    {selectedEntryDetails.tags.length === 0 ? (
                      <span className="chip chip-muted">No tags</span>
                    ) : (
                      selectedEntryDetails.tags.map((tag) => (
                        <span key={tag} className="chip">
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="eyebrow">Agent access tags</span>
                  <div className="chip-row">
                    {selectedEntryDetails.agentAccessTags.length === 0 ? (
                      <span className="chip chip-muted">No agent tags</span>
                    ) : (
                      selectedEntryDetails.agentAccessTags.map((tag) => (
                        <span key={tag} className="chip">
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="notes-panel">
                <span className="eyebrow">Notes</span>
                <p>{selectedEntryDetails.notes || 'No notes recorded.'}</p>
              </div>

              <div className="panel export-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Exports</span>
                    <h3>Generate real snippets</h3>
                  </div>
                </div>
                <p className="panel-note">
                  OpenClaw exports use deterministic key selection: `active` first, then
                  `old`, with `revoked` entries excluded from env output.
                </p>

                <div className="export-target">
                  <div>
                    <span className="eyebrow">Target</span>
                    <strong>
                      {effectiveExportScope === 'selected'
                        ? selectedEntryDetails.name
                        : `${filteredEntries.length} filtered entries`}
                    </strong>
                    <small>
                      Copy is always explicit. CodexVault never writes into live configs
                      automatically.
                    </small>
                  </div>
                  <div className="scope-toggle">
                    <button
                      className={
                        effectiveExportScope === 'selected'
                          ? 'primary-button'
                          : 'secondary-button'
                      }
                      disabled={busy}
                      onClick={() => {
                        setExportScope('selected')
                        setExportPreview(null)
                      }}
                    >
                      Selected entry
                    </button>
                    <button
                      className={
                        effectiveExportScope === 'filtered'
                          ? 'primary-button'
                          : 'secondary-button'
                      }
                      disabled={busy || filteredEntries.length === 0}
                      onClick={() => {
                        setExportScope('filtered')
                        setExportPreview(null)
                      }}
                    >
                      Filtered set ({filteredEntries.length})
                    </button>
                  </div>
                </div>

                <div className="export-list">
                  {exportOptions.map((option) => (
                    <div
                      key={option.format}
                      className={`export-row ${
                        option.audience === 'openclaw' ? 'export-row-openclaw' : ''
                      }`}
                    >
                      <div>
                        <div className="export-row-title">
                          <strong>{option.label}</strong>
                          {option.audience === 'openclaw' ? (
                            <span className="export-badge">OpenClaw</span>
                          ) : null}
                        </div>
                        <span>{option.description}</span>
                      </div>
                      <div className="export-row-actions">
                        <button
                          className="secondary-button"
                          disabled={busy || exportIds.length === 0}
                          onClick={() => void handlePreviewExport(option.format)}
                        >
                          Preview
                        </button>
                        <button
                          className="primary-button"
                          disabled={busy || exportIds.length === 0}
                          onClick={() => void handleCopyExport(option.format)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {exportPreview ? (
                  <div className="preview-panel">
                    <div className="preview-header">
                      <div>
                        <strong>{formatExportLabel(exportPreview.format)}</strong>
                        <span>
                          {effectiveExportScope === 'selected'
                            ? `Target: ${selectedEntryDetails.name}`
                            : `Target: ${exportIds.length} filtered entries`}
                        </span>
                      </div>
                      <button
                        className="ghost-button"
                        onClick={() => setExportPreview(null)}
                      >
                        Clear preview
                      </button>
                    </div>
                    <pre>{exportPreview.content}</pre>
                    <small>
                      Plaintext previews auto-clear after{' '}
                      {session.settings.revealAutoHideSeconds} seconds or when the
                      window loses focus.
                    </small>
                  </div>
                ) : (
                  <div className="empty-callout">
                    Nothing is exported automatically. Preview or copy a format when
                    you need it.
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {editorMode ? (
        <EntryEditorModal
          key={
            editorMode === 'edit'
              ? `edit:${selectedEntryDetails?.id ?? 'entry'}`
              : 'create'
          }
          entry={editorMode === 'edit' ? selectedEntryDetails : null}
          mode={editorMode}
          onClose={() => setEditorMode(null)}
          onSubmit={handleEntrySubmit}
        />
      ) : null}

      {showSettings ? (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          settings={session.settings}
        />
      ) : null}

      {openClawReview ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-small" role="dialog" aria-modal="true">
            <div className="panel-header">
              <div>
                <span className="eyebrow">OpenClaw</span>
                <h2>Selection report</h2>
              </div>
              <button className="ghost-button" onClick={() => setOpenClawReview(null)}>
                Close
              </button>
            </div>
            <p className="panel-note">
              Review exactly which entries will be used before copying{' '}
              {formatExportLabel(openClawReview.targetFormat)}.
            </p>

            <div className="openclaw-summary-grid">
              <div className="openclaw-summary-card">
                <span>Selected</span>
                <strong>{openClawReview.report.selected.length}</strong>
              </div>
              <div className="openclaw-summary-card">
                <span>Skipped</span>
                <strong>{openClawReview.report.skipped.length}</strong>
              </div>
              <div className="openclaw-summary-card">
                <span>Generated</span>
                <strong>{formatTimestamp(openClawReview.report.generatedAt)}</strong>
              </div>
            </div>

            <div className="openclaw-report-panel">
              <span className="eyebrow">Selection policy</span>
              <p>
                Priority: {openClawReview.report.selectionPolicy.statusPriority.join(' > ')}
              </p>
              <p>Deduping: {openClawReview.report.selectionPolicy.dedupe}</p>
              <p>Revoked: {openClawReview.report.selectionPolicy.revokedBehavior}</p>
            </div>

            <div className="openclaw-report-panel">
              <span className="eyebrow">Selected entries</span>
              {openClawReview.report.selected.length === 0 ? (
                <p>No exportable entries are selected for this scope.</p>
              ) : (
                <div className="openclaw-report-list">
                  {openClawReview.report.selected.map((entry) => (
                    <div key={entry.entryId} className="openclaw-report-row">
                      <div>
                        <strong>{entry.envVarName}</strong>
                        <span>
                          {entry.entryName} ({entry.provider}) [{entry.status}]
                        </span>
                      </div>
                      {entry.usedOldFallback ? (
                        <span className="chip chip-muted">Old fallback</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="openclaw-report-panel">
              <span className="eyebrow">Skipped entries</span>
              {openClawReview.report.skipped.length === 0 ? (
                <p>No entries were skipped.</p>
              ) : (
                <div className="openclaw-report-list">
                  {openClawReview.report.skipped.map((entry) => (
                    <div key={entry.entryId} className="openclaw-report-row">
                      <div>
                        <strong>{entry.envVarName}</strong>
                        <span>
                          {entry.entryName} ({entry.provider}) [{entry.status}]
                        </span>
                      </div>
                      <span className="chip chip-muted">{entry.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setOpenClawReview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void handleConfirmOpenClawCopy()}
              >
                Copy {formatExportLabel(openClawReview.targetFormat)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
