import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('browser demo experience', () => {
  it('is useful without accepting or persisting a credential', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      await screen.findByRole('region', { name: 'Browser demo boundary' }),
    ).toHaveTextContent('Real workflow · fake keys · nothing saved')
    expect(screen.getByText('Read-only sample')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New entry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy secret' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    expect(screen.getByText('demo_openai_primary_not_a_real_key')).toBeInTheDocument()

    const exportRow = screen.getByText('.env block').closest('.export-row')
    expect(exportRow).not.toBeNull()
    await user.click(within(exportRow as HTMLElement).getByRole('button', { name: 'Preview' }))

    await waitFor(() =>
      expect(screen.getByText(/OPENAI_API_KEY="demo_openai_primary_not_a_real_key"/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
  })
})
