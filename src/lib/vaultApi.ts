import { invoke } from '@tauri-apps/api/core'

import type {
  AppSnapshot,
  EntryUpsertInput,
  ExportFormat,
  VaultSettings,
} from './types'

function command<T>(
  commandName: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(commandName, args)
}

export function getAppSnapshot() {
  return command<AppSnapshot>('get_app_snapshot')
}

export function createVault(path: string, vaultName: string, password: string) {
  return command<AppSnapshot>('create_vault', { path, vaultName, password })
}

export function unlockVault(path: string, password: string) {
  return command<AppSnapshot>('unlock_vault', { path, password })
}

export function lockVault() {
  return command<AppSnapshot>('lock_vault')
}

export function setVaultSettings(settings: VaultSettings) {
  return command<AppSnapshot>('set_vault_settings', { settings })
}

export function upsertEntry(input: EntryUpsertInput) {
  return command<AppSnapshot>('upsert_entry', { input })
}

export function deleteEntry(id: string) {
  return command<AppSnapshot>('delete_entry', { id })
}

export function markEntryRotated(id: string) {
  return command<AppSnapshot>('mark_entry_rotated', { id })
}

export function revealSecret(id: string) {
  return command<string>('reveal_secret', { id })
}

export function copySecret(id: string) {
  return command<AppSnapshot>('copy_secret', { id })
}

export function previewExport(ids: string[], format: ExportFormat) {
  return command<string>('preview_export', { ids, format })
}

export function copyExport(ids: string[], format: ExportFormat) {
  return command<AppSnapshot>('copy_export', { ids, format })
}

export function exportEncryptedBackup(path: string) {
  return command<string>('export_encrypted_backup', { path })
}
