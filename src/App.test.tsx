import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { AppSnapshot } from './lib/types'
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
})
