import { invoke } from '@tauri-apps/api/core'

import type {
  AppSnapshot,
  EntryUpsertInput,
  ExportFormat,
  VaultSettings,
} from './types'
import {
  getDemoSnapshot,
  previewDemoExport,
  revealDemoSecret,
} from './demoVault'

function isBrowserDemo() {
  return (
    typeof window !== 'undefined' &&
    !('__TAURI_INTERNALS__' in window)
  )
}

function desktopOnly<T>(): Promise<T> {
  return Promise.reject(
    new Error(
      'The browser demo is read-only. Build the desktop app to create or change an encrypted vault.',
    ),
  )
}

function command<T>(
  commandName: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(commandName, args)
}

export function getAppSnapshot() {
  if (isBrowserDemo()) {
    return Promise.resolve(getDemoSnapshot())
  }
  return command<AppSnapshot>('get_app_snapshot')
}

export function createVault(path: string, vaultName: string, password: string) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('create_vault', { path, vaultName, password })
}

export function unlockVault(path: string, password: string) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('unlock_vault', { path, password })
}

export function lockVault() {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('lock_vault')
}

export function setVaultSettings(settings: VaultSettings) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('set_vault_settings', { settings })
}

export function upsertEntry(input: EntryUpsertInput) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('upsert_entry', { input })
}

export function deleteEntry(id: string) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('delete_entry', { id })
}

export function markEntryRotated(id: string) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('mark_entry_rotated', { id })
}

export function revealSecret(id: string) {
  if (isBrowserDemo()) {
    return Promise.resolve(revealDemoSecret(id))
  }
  return command<string>('reveal_secret', { id })
}

export function copySecret(id: string) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('copy_secret', { id })
}

export function previewExport(ids: string[], format: ExportFormat) {
  if (isBrowserDemo()) {
    return Promise.resolve(previewDemoExport(ids, format))
  }
  return command<string>('preview_export', { ids, format })
}

export function copyExport(ids: string[], format: ExportFormat) {
  if (isBrowserDemo()) {
    return desktopOnly<AppSnapshot>()
  }
  return command<AppSnapshot>('copy_export', { ids, format })
}

export function exportEncryptedBackup(path: string) {
  if (isBrowserDemo()) {
    return desktopOnly<string>()
  }
  return command<string>('export_encrypted_backup', { path })
}
