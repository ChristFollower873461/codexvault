import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { AppSnapshot, EntryUpsertInput, VaultEntryRecord } from './lib/types'
import * as desktop from './lib/desktop'
import * as vaultApi from './lib/vaultApi'

vi.mock('./lib/desktop')
vi.mock('./lib/vaultApi')

const recentVaultPath = '/tmp/operator.cvault'
const masterPassword = 'correct horse battery staple'

function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot))
}

function nowIso() {
  return '2026-03-22T00:00:00Z'
}

function buildEntry(
  input: {
    id: string
    name: string
    provider: string
    envVarName: string
    status: VaultEntryRecord['status']
    environment: string
  },
): VaultEntryRecord {
  return {
    id: input.id,
    name: input.name,
    provider: input.provider,
    envVarName: input.envVarName,
    modelFamily: null,
    models: [],
    tags: [],
    notes: '',
    environment: input.environment,
    agentAccessTags: [],
    status: input.status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rotatedAt: nowIso(),
    lastTestedAt: null,
    lastUsedAt: null,
  }
}

function openClawEnvName(entry: VaultEntryRecord) {
  switch (entry.provider.toLowerCase()) {
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'groq':
      return 'GROQ_API_KEY'
    default:
      return entry.envVarName
  }
}

function statusRank(status: VaultEntryRecord['status']) {
  switch (status) {
    case 'active':
      return 3
    case 'old':
      return 2
    case 'revoked':
      return 1
    default:
      return 0
  }
}

function isOpenClawExport(
  format: string,
): format is 'openClaw' | 'openClawBundle' {
  return format === 'openClaw' || format === 'openClawBundle'
}

describe('release-gate flows', () => {
  let sessionLocked = true
  let clipboard = ''
  let entries: VaultEntryRecord[] = []
  let secrets = new Map<string, string>()

  function buildSnapshot(): AppSnapshot {
    return {
      recentVaults: [
        {
          path: recentVaultPath,
          fileName: 'operator.cvault',
          lastOpenedAt: nowIso(),
        },
      ],
      session: sessionLocked
        ? null
        : {
            vaultName: 'CodexVault',
            currentPath: recentVaultPath,
            settings: {
              idleLockMinutes: 10,
              clipboardClearSeconds: 30,
              revealAutoHideSeconds: 12,
            },
            entries,
          },
    }
  }

  function selectedEntries(ids: string[]) {
    if (ids.length === 0) {
      return [...entries]
    }

    return ids
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is VaultEntryRecord => Boolean(entry))
  }

  function buildOpenClawBundle(ids: string[]) {
    const scopedEntries = selectedEntries(ids)
    const grouped = new Map<string, VaultEntryRecord[]>()
    for (const entry of scopedEntries) {
      const envVarName = openClawEnvName(entry)
      const current = grouped.get(envVarName) ?? []
      current.push(entry)
      grouped.set(envVarName, current)
    }

    const env: Record<string, string> = {}
    const providers: Array<Record<string, unknown>> = []
    const skipped: Array<Record<string, unknown>> = []

    for (const [envVarName, candidates] of grouped.entries()) {
      candidates.sort(
        (left, right) =>
          statusRank(right.status) - statusRank(left.status) ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.name.localeCompare(right.name),
      )

      const selectedIndex = candidates.findIndex(
        (entry) => entry.status !== 'revoked',
      )
      const hasActive = candidates.some((entry) => entry.status === 'active')

      if (selectedIndex >= 0) {
        const selected = candidates[selectedIndex]
        env[envVarName] = secrets.get(selected.id) ?? ''
        providers.push({
          provider: selected.provider.toLowerCase(),
          envVarName,
          entryId: selected.id,
          entryName: selected.name,
          status: selected.status,
          environment: selected.environment,
          modelFamily: selected.modelFamily,
          models: selected.models,
          tags: selected.tags,
          agentAccessTags: selected.agentAccessTags,
          usedOldFallback: !hasActive && selected.status === 'old',
        })
      }

      candidates.forEach((candidate, index) => {
        if (index === selectedIndex) {
          return
        }

        skipped.push({
          envVarName,
          reason:
            candidate.status === 'revoked'
              ? 'revoked'
              : 'shadowedByHigherPriorityEntry',
          entryId: candidate.id,
          entryName: candidate.name,
          provider: candidate.provider,
          status: candidate.status,
          environment: candidate.environment,
        })
      })
    }

    return {
      format: 'codexvault.openclaw.bundle',
      version: 1,
      generatedAt: nowIso(),
      selectionPolicy: {
        statusPriority: ['active', 'old', 'revoked'],
        dedupe: 'one entry per OpenClaw env var name',
        revokedBehavior: 'excluded from env output',
      },
      env,
      providers,
      skipped,
    }
  }

  async function unlockFromRecent(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole('button', { name: /operator\.cvault/i }),
    )
    await user.type(
      screen.getByPlaceholderText('Enter the vault password'),
      masterPassword,
    )
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lock vault' })).toBeInTheDocument(),
    )
  }

  beforeEach(() => {
    vi.resetAllMocks()
    sessionLocked = true
    clipboard = ''

    entries = [
      buildEntry(
        {
          id: 'entry-openai-active',
          name: 'OpenAI Primary',
          provider: 'OpenAI',
          envVarName: 'OPENAI_API_KEY',
          status: 'active',
          environment: 'production',
        },
      ),
      buildEntry(
        {
          id: 'entry-openai-old',
          name: 'OpenAI Legacy',
          provider: 'OpenAI',
          envVarName: 'OPENAI_API_KEY',
          status: 'old',
          environment: 'production',
        },
      ),
      buildEntry(
        {
          id: 'entry-groq-revoked',
          name: 'Groq Revoked',
          provider: 'Groq',
          envVarName: 'GROQ_API_KEY',
          status: 'revoked',
          environment: 'staging',
        },
      ),
    ]

    secrets = new Map([
      ['entry-openai-active', 'sk-openai-active'],
      ['entry-openai-old', 'sk-openai-old'],
      ['entry-groq-revoked', 'gsk-revoked'],
    ])

    vi.mocked(desktop.pickExistingVaultFile).mockResolvedValue(recentVaultPath)
    vi.mocked(desktop.pickNewVaultFile).mockResolvedValue(recentVaultPath)
    vi.mocked(desktop.pickBackupFile).mockResolvedValue('/tmp/backup.cvault')
    vi.mocked(desktop.readClipboardText).mockImplementation(async () => clipboard)
    vi.mocked(desktop.clearClipboardText).mockImplementation(async () => {
      clipboard = ''
    })

    vi.mocked(vaultApi.getAppSnapshot).mockImplementation(async () =>
      cloneSnapshot(buildSnapshot()),
    )
    vi.mocked(vaultApi.unlockVault).mockImplementation(async (path, password) => {
      if (path !== recentVaultPath || password !== masterPassword) {
        throw new Error('Invalid password')
      }
      sessionLocked = false
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.lockVault).mockImplementation(async () => {
      sessionLocked = true
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.createVault).mockImplementation(async () => {
      sessionLocked = false
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.setVaultSettings).mockImplementation(async () =>
      cloneSnapshot(buildSnapshot()),
    )
    vi.mocked(vaultApi.upsertEntry).mockImplementation(async (input: EntryUpsertInput) => {
      if (!sessionLocked) {
        if (input.id) {
          const index = entries.findIndex((entry) => entry.id === input.id)
          if (index >= 0) {
            const current = entries[index]
            entries[index] = {
              ...current,
              name: input.name,
              provider: input.provider,
              envVarName: input.envVarName,
              modelFamily: input.modelFamily ?? null,
              models: [...input.models],
              tags: [...input.tags],
              notes: input.notes,
              environment: input.environment,
              agentAccessTags: [...input.agentAccessTags],
              status: input.status,
              updatedAt: nowIso(),
            }
            if (input.secretValue) {
              secrets.set(input.id, input.secretValue)
            }
          }
        } else {
          const id = `entry-${entries.length + 1}`
          entries = [
            ...entries,
            {
              id,
              name: input.name,
              provider: input.provider,
              envVarName: input.envVarName,
              modelFamily: input.modelFamily ?? null,
              models: [...input.models],
              tags: [...input.tags],
              notes: input.notes,
              environment: input.environment,
              agentAccessTags: [...input.agentAccessTags],
              status: input.status,
              createdAt: nowIso(),
              updatedAt: nowIso(),
              rotatedAt: nowIso(),
              lastTestedAt: null,
              lastUsedAt: null,
            },
          ]
          if (input.secretValue) {
            secrets.set(id, input.secretValue)
          }
        }
      }

      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.deleteEntry).mockImplementation(async (id) => {
      entries = entries.filter((entry) => entry.id !== id)
      secrets.delete(id)
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.markEntryRotated).mockImplementation(async (id) => {
      entries = entries.map((entry) =>
        entry.id === id
          ? { ...entry, rotatedAt: nowIso(), updatedAt: nowIso() }
          : entry,
      )
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.revealSecret).mockImplementation(async (id) => {
      const value = secrets.get(id)
      if (!value) {
        throw new Error('Entry not found')
      }
      return value
    })
    vi.mocked(vaultApi.copySecret).mockImplementation(async (id) => {
      const value = secrets.get(id)
      if (!value) {
        throw new Error('Entry not found')
      }
      clipboard = value
      entries = entries.map((entry) =>
        entry.id === id ? { ...entry, lastUsedAt: nowIso(), updatedAt: nowIso() } : entry,
      )
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.previewExport).mockImplementation(
      async (ids, format) => {
        if (isOpenClawExport(format)) {
          const bundle = buildOpenClawBundle(ids)
          if (format === 'openClawBundle') {
            return JSON.stringify(bundle, null, 2)
          }
          return Object.entries(bundle.env)
            .map(([envVarName, value]) => `${envVarName}=${JSON.stringify(value)}`)
            .join('\n')
        }

        return JSON.stringify({ format, ids }, null, 2)
      },
    )
    vi.mocked(vaultApi.copyExport).mockImplementation(async (ids, format) => {
      clipboard = await vi.mocked(vaultApi.previewExport)(ids, format)
      const touched = ids.length === 0 ? new Set(entries.map((entry) => entry.id)) : new Set(ids)
      entries = entries.map((entry) =>
        touched.has(entry.id)
          ? { ...entry, lastUsedAt: nowIso(), updatedAt: nowIso() }
          : entry,
      )
      return cloneSnapshot(buildSnapshot())
    })
    vi.mocked(vaultApi.exportEncryptedBackup).mockResolvedValue('/tmp/backup.cvault')
  })

  it('handles unlock, entry create, reveal, and lock flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(screen.getByText('operator.cvault')).toBeInTheDocument(),
    )
    await unlockFromRecent(user)

    await user.click(screen.getByRole('button', { name: 'New entry' }))
    const editorDialog = screen.getByRole('dialog')
    await user.type(
      within(editorDialog).getByLabelText('Name'),
      'OpenRouter Backup',
    )
    await user.type(
      within(editorDialog).getByLabelText('Provider'),
      'OpenRouter',
    )
    await user.type(
      within(editorDialog).getByLabelText('Env var name'),
      'OPENROUTER_API_KEY',
    )
    await user.type(
      within(editorDialog).getByLabelText('Secret value'),
      'or-secret-value',
    )
    await user.click(within(editorDialog).getByRole('button', { name: 'Add entry' }))

    await waitFor(() =>
      expect(screen.getByText('OpenRouter Backup')).toBeInTheDocument(),
    )

    const newEntryButton = screen.getByText('OpenRouter Backup').closest('button')
    expect(newEntryButton).not.toBeNull()
    await user.click(newEntryButton!)

    await user.click(screen.getByRole('button', { name: 'Reveal secret' }))
    await waitFor(() =>
      expect(screen.getByText('or-secret-value')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Lock vault' }))
    await waitFor(() =>
      expect(screen.getByText('Local-first key custody')).toBeInTheDocument(),
    )
  })

  it('requires OpenClaw selection review before copy', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(screen.getByText('operator.cvault')).toBeInTheDocument(),
    )
    await unlockFromRecent(user)
    await user.click(
      screen.getByRole('button', { name: /OpenAI PrimaryOpenAI/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Filtered set/ }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /Filtered set/ }))

    const openClawRow = screen
      .getByText('OpenClaw env')
      .closest('.export-row') as HTMLElement | null
    expect(openClawRow).not.toBeNull()

    const openClawCopyButton = within(openClawRow!).getByRole('button', {
      name: 'Copy',
    })
    await user.click(openClawCopyButton)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Selection report' })).toBeInTheDocument(),
    )
    expect(screen.getAllByText('shadowedByHigherPriorityEntry').length).toBeGreaterThan(0)
    expect(vi.mocked(vaultApi.copyExport)).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Copy OpenClaw env' }))

    await waitFor(() =>
      expect(vi.mocked(vaultApi.copyExport)).toHaveBeenCalledWith(
        ['entry-openai-active', 'entry-openai-old', 'entry-groq-revoked'],
        'openClaw',
      ),
    )
    expect(
      screen.queryByRole('heading', { name: 'Selection report' }),
    ).not.toBeInTheDocument()
  })
})
