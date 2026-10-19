import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EntryEditorModal } from './EntryEditorModal'

describe('EntryEditorModal', () => {
  it('requires a secret for new entries without storing it in form state', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)

    render(
      <EntryEditorModal
        mode="create"
        entry={null}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Primary OpenAI key')
    await user.type(screen.getByLabelText('Provider'), 'OpenAI')
    await user.type(screen.getByLabelText('Env var name'), 'OPENAI_API_KEY')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('Secret value is required for new entries'),
    ).toBeInTheDocument()

    const secretInput = screen.getByLabelText('Secret value')
    await user.type(secretInput, '  sk-test-value  ')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        id: undefined,
        name: 'Primary OpenAI key',
        provider: 'OpenAI',
        envVarName: 'OPENAI_API_KEY',
        secretValue: '  sk-test-value  ',
        modelFamily: undefined,
        models: [],
        tags: [],
        notes: '',
        environment: '',
        agentAccessTags: [],
        status: 'active',
      }),
    )
    await waitFor(() => expect(secretInput).toHaveValue(''))
  })

  it('leaves the secret unchanged on edit when the replacement field is blank', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)

    render(
      <EntryEditorModal
        mode="edit"
        entry={{
          id: 'entry-1',
          name: 'Anthropic key',
          provider: 'Anthropic',
          envVarName: 'ANTHROPIC_API_KEY',
          modelFamily: 'claude',
          models: ['claude-sonnet-4'],
          tags: ['prod'],
          notes: 'Primary production key',
          environment: 'production',
          agentAccessTags: ['writer'],
          status: 'active',
          createdAt: '2026-03-21T12:00:00Z',
          updatedAt: '2026-03-21T12:00:00Z',
          rotatedAt: null,
          lastTestedAt: null,
          lastUsedAt: null,
        }}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    )

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Anthropic key rotated')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        id: 'entry-1',
        name: 'Anthropic key rotated',
        provider: 'Anthropic',
        envVarName: 'ANTHROPIC_API_KEY',
        secretValue: undefined,
        modelFamily: 'claude',
        models: ['claude-sonnet-4'],
        tags: ['prod'],
        notes: 'Primary production key',
        environment: 'production',
        agentAccessTags: ['writer'],
        status: 'active',
      }),
    )
  })

  it.each(['false', 'rejection'])('retains a draft after %s until a save is acknowledged', async (failure) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    if (failure === 'false') {
      onSubmit.mockResolvedValueOnce(false)
    } else {
      onSubmit.mockRejectedValueOnce(new Error('Synthetic save failure'))
    }
    onSubmit.mockResolvedValueOnce(true)

    render(
      <EntryEditorModal mode="create" entry={null} onClose={() => {}} onSubmit={onSubmit} />,
    )

    await user.type(screen.getByLabelText('Name'), 'Synthetic retry entry')
    await user.type(screen.getByLabelText('Provider'), 'Synthetic provider')
    await user.type(screen.getByLabelText('Env var name'), 'SYNTHETIC_API_KEY')
    const secretInput = screen.getByLabelText('Secret value')
    await user.type(secretInput, 'synthetic_not_a_real_key')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(secretInput).toHaveValue('synthetic_not_a_real_key')
    expect(screen.getByLabelText('Name')).toHaveValue('Synthetic retry entry')

    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0])
    await waitFor(() => expect(secretInput).toHaveValue(''))
  })
})
