import type { EntryStatus, VaultEntryRecord } from './types'

export interface EntryFilters {
  search: string
  provider: string
  environment: string
  tag: string
  status: EntryStatus | 'all'
}

export function filterEntries(
  entries: VaultEntryRecord[],
  filters: EntryFilters,
) {
  const query = filters.search.trim().toLowerCase()

  return entries.filter((entry) => {
    if (filters.provider !== 'all' && entry.provider !== filters.provider) {
      return false
    }
    if (
      filters.environment !== 'all' &&
      entry.environment !== filters.environment
    ) {
      return false
    }
    if (filters.tag !== 'all' && !entry.tags.includes(filters.tag)) {
      return false
    }
    if (filters.status !== 'all' && entry.status !== filters.status) {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [
      entry.name,
      entry.provider,
      entry.envVarName,
      entry.modelFamily ?? '',
      entry.models.join(' '),
      entry.tags.join(' '),
      entry.notes,
      entry.environment,
      entry.agentAccessTags.join(' '),
      entry.status,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

export function deriveFilterOptions(entries: VaultEntryRecord[]) {
  const providers = new Set<string>()
  const environments = new Set<string>()
  const tags = new Set<string>()

  for (const entry of entries) {
    if (entry.provider) {
      providers.add(entry.provider)
    }
    if (entry.environment) {
      environments.add(entry.environment)
    }
    for (const tag of entry.tags) {
      tags.add(tag)
    }
  }

  return {
    providers: [...providers].sort((left, right) => left.localeCompare(right)),
    environments: [...environments].sort((left, right) =>
      left.localeCompare(right),
    ),
    tags: [...tags].sort((left, right) => left.localeCompare(right)),
  }
}
