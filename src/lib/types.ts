export const entryStatuses = ['active', 'old', 'revoked'] as const
export type EntryStatus = (typeof entryStatuses)[number]

export type ExportFormat =
  | 'env'
  | 'genericJson'
  | 'openClaw'
  | 'openClawBundle'
  | 'providerSnippet'

export interface VaultSettings {
  idleLockMinutes: number
  clipboardClearSeconds: number
  revealAutoHideSeconds: number
}

export interface VaultEntryRecord {
  id: string
  name: string
  provider: string
  envVarName: string
  modelFamily: string | null
  models: string[]
  tags: string[]
  notes: string
  environment: string
  agentAccessTags: string[]
  status: EntryStatus
  createdAt: string
  updatedAt: string
  rotatedAt: string | null
  lastTestedAt: string | null
  lastUsedAt: string | null
}

export interface UnlockedVaultSnapshot {
  vaultName: string
  currentPath: string
  settings: VaultSettings
  entries: VaultEntryRecord[]
}

export interface RecentVault {
  path: string
  fileName: string
  lastOpenedAt: string
}

export interface AppSnapshot {
  recentVaults: RecentVault[]
  session: UnlockedVaultSnapshot | null
}

export interface EntryUpsertInput {
  id?: string
  name: string
  provider: string
  envVarName: string
  secretValue?: string
  modelFamily?: string
  models: string[]
  tags: string[]
  notes: string
  environment: string
  agentAccessTags: string[]
  status: EntryStatus
}
