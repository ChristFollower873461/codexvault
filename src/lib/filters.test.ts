import { describe, expect, it } from 'vitest'

import { filterEntries } from './filters'
import type { VaultEntryRecord } from './types'

const entries: VaultEntryRecord[] = [
  {
    id: '1',
    name: 'OpenAI Primary',
    provider: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    modelFamily: 'gpt-4.1',
    models: ['gpt-4.1'],
    tags: ['prod', 'chat'],
    notes: 'Used by the production writer agent.',
    environment: 'production',
    agentAccessTags: ['writer'],
    status: 'active',
    createdAt: '2026-03-21T10:00:00Z',
    updatedAt: '2026-03-21T10:00:00Z',
    rotatedAt: null,
    lastTestedAt: null,
    lastUsedAt: null,
  },
  {
    id: '2',
    name: 'Anthropic Staging',
    provider: 'Anthropic',
    envVarName: 'ANTHROPIC_API_KEY',
    modelFamily: 'claude-sonnet',
    models: ['claude-sonnet-4-5'],
    tags: ['staging'],
    notes: 'For QA and notes workflow.',
    environment: 'staging',
    agentAccessTags: ['qa'],
    status: 'old',
    createdAt: '2026-03-21T10:00:00Z',
    updatedAt: '2026-03-21T10:00:00Z',
    rotatedAt: null,
    lastTestedAt: null,
    lastUsedAt: null,
  },
]

describe('filterEntries', () => {
  it('searches provider notes and tags', () => {
    expect(
      filterEntries(entries, {
        search: 'writer',
        provider: 'all',
        environment: 'all',
        tag: 'all',
        status: 'all',
      }),
    ).toHaveLength(1)
  })

  it('applies provider and status filters together', () => {
    expect(
      filterEntries(entries, {
        search: '',
        provider: 'Anthropic',
        environment: 'all',
        tag: 'all',
        status: 'old',
      }),
    ).toEqual([entries[1]])
  })
})
