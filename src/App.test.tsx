import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { AppSnapshot, VaultEntryRecord } from './lib/types'
import * as desktop from './lib/desktop'
import * as vaultApi from './lib/vaultApi'

vi.mock('./lib/desktop')
vi.mock('./lib/vaultApi')

const lockedSnapshot: AppSnapshot = {
  recentVaults: [
    {
      path: '/tmp/operator.cvault',
      fileName: 'operator.cvault',
      lastOpenedAt: '2026-03-21T10:00:00Z',
    },
  ],
  session: null,
}

const unlockedSnapshot: AppSnapshot = {
  recentVaults: lockedSnapshot.recentVaults,
  session: {
    vaultName: 'CodexVault',
    currentPath: '/tmp/operator.cvault',
    settings: {
      idleLockMinutes: 10,
      clipboardClearSeconds: 30,
      revealAutoHideSeconds: 12,
    },
    entries: [],
  },
}

const syntheticEntry: VaultEntryRecord = {
  id: 'synthetic-entry',
  name: 'Synthetic entry',
  provider: 'Synthetic provider',
  envVarName: 'SYNTHETIC_API_KEY',
  modelFamily: null,
  models: [],
  tags: [],
  notes: 'Synthetic save-recovery fixture',
  environment: 'test',
  agentAccessTags: [],
  status: 'active',
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
  rotatedAt: null,
  lastTestedAt: null,
  lastUsedAt: null,
}

const populatedSnapshot: AppSnapshot = {
  recentVaults: [],
  session: {
    vaultName: 'Synthetic vault',
    currentPath: '/synthetic/not-opened.cvault',
    settings: { idleLockMinutes: 0, clipboardClearSeconds: 0, revealAutoHideSeconds: 0 },
    entries: [syntheticEntry],
  },
}

async function openCreateEditor() {
  const user = userEvent.setup()
  vi.mocked(vaultApi.getAppSnapshot).mockResolvedValue(unlockedSnapshot)
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'New entry' }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Name'), syntheticEntry.name)
  await user.type(within(dialog).getByLabelText('Provider'), syntheticEntry.provider)
  await user.type(within(dialog).getByLabelText('Env var name'), syntheticEntry.envVarName)
  return { user, dialog, secretInput: within(dialog).getByLabelText('Secret value') }
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(vaultApi.getAppSnapshot).mockResolvedValue(lockedSnapshot)
    vi.mocked(vaultApi.unlockVault).mockResolvedValue(unlockedSnapshot)
    vi.mocked(desktop.pickExistingVaultFile).mockResolvedValue(
      '/tmp/operator.cvault',
    )
    vi.mocked(desktop.readClipboardText).mockResolvedValue('')
    vi.mocked(desktop.clearClipboardText).mockResolvedValue()
  })

  it('unlocks a recent vault path', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(screen.getByText('operator.cvault')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: /operator\.cvault/i }),
    )
    await user.type(
      screen.getByPlaceholderText('Enter the vault password'),
      'correct horse battery staple',
    )
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() =>
      expect(vaultApi.unlockVault).toHaveBeenCalledWith(
        '/tmp/operator.cvault',
        'correct horse battery staple',
      ),
    )
  })

  it('preserves a failed new-entry draft and retries the same value before closing on success', async () => {
    vi.mocked(vaultApi.upsertEntry)
      .mockRejectedValueOnce(new Error('Synthetic persistence failure'))
      .mockResolvedValueOnce(populatedSnapshot)
    const { user, dialog, secretInput } = await openCreateEditor()
    await user.type(secretInput, 'synthetic_not_a_real_key_new')
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic persistence failure')
    expect(dialog).toBeInTheDocument()
    expect(secretInput).toHaveValue('synthetic_not_a_real_key_new')
    expect(within(dialog).getByLabelText('Name')).toHaveValue(syntheticEntry.name)
    expect(screen.queryByText('Entry added.')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(vaultApi.upsertEntry).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(vaultApi.upsertEntry).mock.calls
    expect(calls[0][0].secretValue).toBe('synthetic_not_a_real_key_new')
    expect(calls[1][0]).toEqual(calls[0][0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Entry added.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New entry' }))
    expect(screen.getByLabelText('Secret value')).toHaveValue('')
  })

  it('preserves a failed replacement and retries it explicitly', async () => {
    vi.mocked(vaultApi.getAppSnapshot).mockResolvedValue(populatedSnapshot)
    vi.mocked(vaultApi.upsertEntry)
      .mockRejectedValueOnce(new Error('Synthetic persistence failure'))
      .mockResolvedValueOnce(populatedSnapshot)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Edit selected' }))
    const dialog = screen.getByRole('dialog')
    const secretInput = within(dialog).getByLabelText('Replace secret value')
    await user.type(secretInput, 'synthetic_not_a_real_key_replacement')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic persistence failure')
    expect(secretInput).toHaveValue('synthetic_not_a_real_key_replacement')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(vaultApi.upsertEntry).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(vaultApi.upsertEntry).mock.calls
    expect(calls[0][0]).toEqual(expect.objectContaining({
      id: syntheticEntry.id,
      secretValue: 'synthetic_not_a_real_key_replacement',
    }))
    expect(calls[1][0]).toEqual(calls[0][0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Entry updated.')).toBeInTheDocument()
  })

  it('discards a failed draft when the editor is canceled', async () => {
    vi.mocked(vaultApi.upsertEntry).mockRejectedValueOnce(new Error('Synthetic persistence failure'))
    const { user, dialog, secretInput } = await openCreateEditor()
    await user.type(secretInput, 'synthetic_not_a_real_key_discard')
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic persistence failure')
    expect(secretInput).toHaveValue('synthetic_not_a_real_key_discard')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New entry' }))
    expect(screen.getByLabelText('Secret value')).toHaveValue('')
    expect(vaultApi.upsertEntry).toHaveBeenCalledTimes(1)
  })
})
