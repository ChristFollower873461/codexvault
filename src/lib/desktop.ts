import { clear, readText } from '@tauri-apps/plugin-clipboard-manager'
import { open, save } from '@tauri-apps/plugin-dialog'

const vaultFilters = [{ name: 'CodexVault Vault', extensions: ['cvault'] }]

export async function pickExistingVaultFile() {
  const selected = await open({
    title: 'Open CodexVault',
    filters: vaultFilters,
    multiple: false,
  })

  return Array.isArray(selected) ? selected[0] ?? null : selected
}

export function pickNewVaultFile(defaultName: string) {
  const safeName = defaultName.trim() || 'codexvault'
  return save({
    title: 'Create CodexVault',
    defaultPath: `${safeName}.cvault`,
    filters: vaultFilters,
  })
}

export function pickBackupFile(defaultName: string) {
  return save({
    title: 'Export encrypted backup',
    defaultPath: `${defaultName.trim() || 'codexvault'}-backup.cvault`,
    filters: vaultFilters,
  })
}

export function readClipboardText() {
  return readText()
}

export function clearClipboardText() {
  return clear()
}
