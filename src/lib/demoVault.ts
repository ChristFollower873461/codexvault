import type { AppSnapshot, ExportFormat, VaultEntryRecord } from './types'

const demoGeneratedAt = '2026-07-31T18:30:00.000Z'

const demoEntries: VaultEntryRecord[] = [
  {
    id: 'demo-openai-primary',
    name: 'OpenAI · primary',
    provider: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    modelFamily: 'GPT',
    models: ['gpt-5.6', 'gpt-5.6-mini'],
    tags: ['operator', 'reasoning', 'primary'],
    notes: 'Primary operator key. Fake value for the browser walkthrough.',
    environment: 'production',
    agentAccessTags: ['planning', 'coding'],
    status: 'active',
    createdAt: '2026-06-18T14:22:00.000Z',
    updatedAt: '2026-07-31T18:30:00.000Z',
    rotatedAt: '2026-07-15T09:00:00.000Z',
    lastTestedAt: '2026-07-31T18:15:00.000Z',
    lastUsedAt: '2026-07-31T18:28:00.000Z',
  },
  {
    id: 'demo-anthropic-evals',
    name: 'Anthropic · evaluations',
    provider: 'Anthropic',
    envVarName: 'ANTHROPIC_API_KEY',
    modelFamily: 'Claude',
    models: ['claude-opus-4-1', 'claude-sonnet-4'],
    tags: ['evaluation', 'staging'],
    notes: 'Isolated evaluation key with no production workload access.',
    environment: 'staging',
    agentAccessTags: ['eval-runner'],
    status: 'active',
    createdAt: '2026-06-24T11:10:00.000Z',
    updatedAt: '2026-07-29T15:42:00.000Z',
    rotatedAt: '2026-07-20T12:00:00.000Z',
    lastTestedAt: '2026-07-29T15:40:00.000Z',
    lastUsedAt: '2026-07-29T15:41:00.000Z',
  },
  {
    id: 'demo-openai-legacy',
    name: 'OpenAI · legacy fallback',
    provider: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    modelFamily: 'GPT',
    models: ['gpt-4.1'],
    tags: ['fallback', 'rotation'],
    notes: 'Retained temporarily for rollback; shadowed by the active key.',
    environment: 'production',
    agentAccessTags: ['break-glass'],
    status: 'old',
    createdAt: '2026-04-12T08:00:00.000Z',
    updatedAt: '2026-07-15T09:00:00.000Z',
    rotatedAt: '2026-07-15T09:00:00.000Z',
    lastTestedAt: '2026-07-14T17:30:00.000Z',
    lastUsedAt: '2026-07-15T08:58:00.000Z',
  },
  {
    id: 'demo-groq-sandbox',
    name: 'Groq · batch sandbox',
    provider: 'Groq',
    envVarName: 'GROQ_API_KEY',
    modelFamily: 'Llama',
    models: ['llama-3.3-70b-versatile'],
    tags: ['batch', 'sandbox'],
    notes: 'Old sandbox credential awaiting final removal from experiments.',
    environment: 'sandbox',
    agentAccessTags: ['batch-lab'],
    status: 'old',
    createdAt: '2026-05-04T16:20:00.000Z',
    updatedAt: '2026-07-08T10:05:00.000Z',
    rotatedAt: '2026-07-08T10:05:00.000Z',
    lastTestedAt: '2026-07-08T10:00:00.000Z',
    lastUsedAt: '2026-07-07T21:45:00.000Z',
  },
  {
    id: 'demo-github-revoked',
    name: 'GitHub · retired automation',
    provider: 'GitHub',
    envVarName: 'GITHUB_TOKEN',
    modelFamily: null,
    models: [],
    tags: ['automation', 'retired'],
    notes: 'Revoked token kept as metadata so its retirement remains auditable.',
    environment: 'operations',
    agentAccessTags: [],
    status: 'revoked',
    createdAt: '2026-03-01T13:00:00.000Z',
    updatedAt: '2026-06-30T19:12:00.000Z',
    rotatedAt: '2026-06-30T19:12:00.000Z',
    lastTestedAt: '2026-06-30T19:10:00.000Z',
    lastUsedAt: '2026-06-30T18:54:00.000Z',
  },
]

const demoSecrets = new Map<string, string>([
  ['demo-openai-primary', 'demo_openai_primary_not_a_real_key'],
  ['demo-anthropic-evals', 'demo_anthropic_evals_not_a_real_key'],
  ['demo-openai-legacy', 'demo_openai_legacy_not_a_real_key'],
  ['demo-groq-sandbox', 'demo_groq_sandbox_not_a_real_key'],
  ['demo-github-revoked', 'demo_github_revoked_not_a_real_key'],
])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function entriesFor(ids: string[]) {
  const scoped = ids.length === 0
    ? demoEntries
    : ids
        .map((id) => demoEntries.find((entry) => entry.id === id))
        .filter((entry): entry is VaultEntryRecord => Boolean(entry))

  return scoped.map((entry) => ({
    entry,
    secretValue: demoSecrets.get(entry.id) ?? 'demo_missing_not_a_real_key',
  }))
}

function openClawSelection(ids: string[]) {
  const grouped = new Map<string, ReturnType<typeof entriesFor>>()

  for (const candidate of entriesFor(ids)) {
    const current = grouped.get(candidate.entry.envVarName) ?? []
    current.push(candidate)
    grouped.set(candidate.entry.envVarName, current)
  }

  const rank = { active: 3, old: 2, revoked: 1 }
  const selected: ReturnType<typeof entriesFor> = []
  const skipped: Array<{
    envVarName: string
    reason: string
    entryId: string
    entryName: string
    provider: string
    status: string
    environment: string
  }> = []

  for (const [envVarName, candidates] of grouped) {
    candidates.sort(
      (left, right) =>
        rank[right.entry.status] - rank[left.entry.status] ||
        right.entry.updatedAt.localeCompare(left.entry.updatedAt),
    )

    const chosen = candidates.find((candidate) => candidate.entry.status !== 'revoked')
    if (chosen) {
      selected.push(chosen)
    }

    for (const candidate of candidates) {
      if (candidate === chosen) {
        continue
      }
      skipped.push({
        envVarName,
        reason:
          candidate.entry.status === 'revoked'
            ? 'revoked'
            : 'shadowedByHigherPriorityEntry',
        entryId: candidate.entry.id,
        entryName: candidate.entry.name,
        provider: candidate.entry.provider,
        status: candidate.entry.status,
        environment: candidate.entry.environment,
      })
    }
  }

  return { selected, skipped }
}

export function getDemoSnapshot(): AppSnapshot {
  return clone({
    mode: 'demo',
    recentVaults: [],
    session: {
      vaultName: 'Operator Vault · sample',
      currentPath: 'Browser memory · fake data only',
      settings: {
        idleLockMinutes: 10,
        clipboardClearSeconds: 30,
        revealAutoHideSeconds: 12,
      },
      entries: demoEntries,
    },
  })
}

export function revealDemoSecret(id: string) {
  const secret = demoSecrets.get(id)
  if (!secret) {
    throw new Error('That sample entry does not exist in the browser demo.')
  }
  return secret
}

export function previewDemoExport(ids: string[], format: ExportFormat) {
  const scoped = entriesFor(ids)

  if (format === 'env') {
    return scoped
      .filter(({ entry }) => entry.status !== 'revoked')
      .map(({ entry, secretValue }) => `${entry.envVarName}="${secretValue}"`)
      .join('\n')
  }

  if (format === 'genericJson') {
    return JSON.stringify(
      scoped.map(({ entry, secretValue }) => ({
        provider: entry.provider,
        envVarName: entry.envVarName,
        secretValue,
        environment: entry.environment,
        status: entry.status,
      })),
      null,
      2,
    )
  }

  if (format === 'providerSnippet') {
    return JSON.stringify(
      scoped.map(({ entry, secretValue }) => ({
        provider: entry.provider.toLowerCase(),
        apiKey: secretValue,
        models: entry.models,
      })),
      null,
      2,
    )
  }

  const { selected, skipped } = openClawSelection(ids)
  const env = Object.fromEntries(
    selected.map(({ entry, secretValue }) => [entry.envVarName, secretValue]),
  )

  if (format === 'openClaw') {
    return Object.entries(env)
      .map(([name, value]) => `${name}="${value}"`)
      .join('\n')
  }

  return JSON.stringify(
    {
      format: 'codexvault.openclaw.bundle',
      version: 1,
      generatedAt: demoGeneratedAt,
      selectionPolicy: {
        statusPriority: ['active', 'old', 'revoked'],
        dedupe: 'one entry per OpenClaw env var name',
        revokedBehavior: 'excluded from env output',
      },
      env,
      providers: selected.map(({ entry }) => ({
        provider: entry.provider.toLowerCase(),
        envVarName: entry.envVarName,
        entryId: entry.id,
        entryName: entry.name,
        status: entry.status,
        environment: entry.environment,
        usedOldFallback: entry.status === 'old',
      })),
      skipped,
    },
    null,
    2,
  )
}
