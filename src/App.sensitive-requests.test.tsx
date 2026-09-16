import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDeferredValue } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useIdleLock } from './hooks/useIdleLock'
import type { AppSnapshot, VaultEntryRecord } from './lib/types'
import * as vaultApi from './lib/vaultApi'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useDeferredValue: vi.fn(actual.useDeferredValue) }
})
vi.mock('./lib/desktop')
vi.mock('./lib/vaultApi')
vi.mock('./hooks/useIdleLock')

const entry: VaultEntryRecord = {
  id: 'synthetic-entry', name: 'Example key', provider: 'Example',
  envVarName: 'EXAMPLE_KEY', modelFamily: null, models: [], tags: [],
  notes: '', environment: 'test', agentAccessTags: [], status: 'active',
  createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z',
  rotatedAt: null, lastTestedAt: null, lastUsedAt: null,
}
const snapshot: AppSnapshot = {
  recentVaults: [],
  session: {
    vaultName: 'Example vault', currentPath: '/tmp/example.cvault',
    settings: { idleLockMinutes: 10, clipboardClearSeconds: 30, revealAutoHideSeconds: 12 },
    entries: [entry, { ...entry, id: 'other-entry', name: 'Other key' }],
  },
}
const syntheticSecret = 'not_a_real_key_delayed_response'
const report = JSON.stringify({
  format: 'codexvault.openclaw.bundle', generatedAt: '2026-09-04T00:00:00Z',
  selectionPolicy: { statusPriority: ['active', 'old', 'revoked'], dedupe: 'one per provider', revokedBehavior: 'excluded' },
  providers: [], skipped: [],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('sensitive request lifetimes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(vaultApi.getAppSnapshot).mockResolvedValue(snapshot)
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['reveal', 'blur'], ['preview', 'blur'], ['review', 'blur'],
    ['reveal', 'hidden'], ['preview', 'hidden'], ['review', 'hidden'],
  ] as const)(
    'discards a delayed %s response after %s',
    async (action, boundary) => {
      const user = userEvent.setup()
      const pending = deferred<string>()
      vi.mocked(vaultApi.revealSecret).mockReturnValue(pending.promise)
      vi.mocked(vaultApi.previewExport).mockReturnValue(pending.promise)
      render(<App />)
      await screen.findByRole('button', { name: 'Reveal secret' })

      if (action === 'reveal') {
        await user.click(screen.getByRole('button', { name: 'Reveal secret' }))
      } else if (action === 'preview') {
        await user.click(screen.getAllByRole('button', { name: 'Preview' })[0])
      } else {
        const row = screen.getByText('OpenClaw env', { selector: 'strong' }).closest('.export-row') as HTMLElement
        await user.click(within(row).getByRole('button', { name: 'Copy' }))
      }

      if (boundary === 'blur') {
        fireEvent.blur(window)
      } else {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        fireEvent(document, new Event('visibilitychange'))
      }
      await act(async () => { pending.resolve(action === 'review' ? report : syntheticSecret) })

      expect(screen.queryByText(syntheticSecret)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Hide secret' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear preview' })).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('discards an export preview when its filter target changes while loading', async () => {
    const user = userEvent.setup()
    const pending = deferred<string>()
    vi.mocked(vaultApi.previewExport).mockReturnValue(pending.promise)
    render(<App />)
    await screen.findByRole('button', { name: 'Reveal secret' })
    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0])
    await user.type(screen.getByPlaceholderText('Name, provider, notes, tags, environment'), 'Other')
    await act(async () => { pending.resolve(syntheticSecret) })

    expect(screen.queryByText(syntheticSecret)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear preview' })).not.toBeInTheDocument()
  })

  it('clears a completed preview when deferred search advances to a new target', async () => {
    const user = userEvent.setup()
    // Control only the scheduler boundary: input has changed, but the previous
    // deferred result remains usable until we explicitly advance it below.
    const deferredSearch = vi.mocked(useDeferredValue).mockReturnValue('')
    vi.mocked(vaultApi.previewExport).mockResolvedValue(syntheticSecret)
    const view = render(<App />)
    await screen.findByRole('button', { name: 'Reveal secret' })
    await user.type(screen.getByPlaceholderText('Name, provider, notes, tags, environment'), 'Other')
    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0])

    expect(vaultApi.previewExport).toHaveBeenCalledWith(['synthetic-entry'], 'env')
    await screen.findByText(syntheticSecret)

    deferredSearch.mockImplementation((value) => value)
    view.rerender(<App />)

    expect(screen.getByRole('heading', { name: 'Other key' })).toBeInTheDocument()
    expect(screen.queryByText(syntheticSecret)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear preview' })).not.toBeInTheDocument()
  })

  it('discards a pending reveal as soon as idle locking starts', async () => {
    const user = userEvent.setup()
    const reveal = deferred<string>()
    const lock = deferred<AppSnapshot>()
    vi.mocked(vaultApi.revealSecret).mockReturnValue(reveal.promise)
    vi.mocked(vaultApi.lockVault).mockReturnValue(lock.promise)
    render(<App />)
    await screen.findByRole('button', { name: 'Reveal secret' })
    await user.click(screen.getByRole('button', { name: 'Reveal secret' }))

    act(() => vi.mocked(useIdleLock).mock.calls.at(-1)![0].onLock())
    expect(vaultApi.lockVault).toHaveBeenCalledOnce()
    await act(async () => { reveal.resolve(syntheticSecret) })
    expect(screen.queryByText(syntheticSecret)).not.toBeInTheDocument()
    await act(async () => { lock.resolve({ recentVaults: [], session: null }) })
  })

  it('allows a new explicit reveal after returning to the window', async () => {
    const user = userEvent.setup()
    vi.mocked(vaultApi.revealSecret).mockResolvedValue(syntheticSecret)
    render(<App />)
    await screen.findByRole('button', { name: 'Reveal secret' })
    fireEvent.blur(window)
    fireEvent.focus(window)
    await user.click(screen.getByRole('button', { name: 'Reveal secret' }))
    await waitFor(() => expect(screen.getByText(syntheticSecret)).toBeInTheDocument())
  })
})
