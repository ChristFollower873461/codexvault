use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroize;

use crate::{
    crypto::default_kdf_metadata,
    error::{AppError, AppResult},
    exports,
    models::{
        normalize_list, normalize_optional, normalize_string, now_timestamp, AppSnapshot,
        EntryUpsertInput, VaultEntry, VaultPayload, VaultSettings,
    },
    prefs,
    state::{AppState, VaultSession},
    storage::{normalize_vault_path, open_vault, save_payload},
};

#[tauri::command(rename_all = "camelCase")]
pub fn get_app_snapshot(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppSnapshot> {
    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    vault_name: String,
    password: String,
) -> AppResult<AppSnapshot> {
    if password.trim().is_empty() {
        return Err(AppError::Validation("Master password is required.".into()));
    }
    let normalized_name = normalize_string(vault_name);
    if normalized_name.is_empty() {
        return Err(AppError::Validation("Vault name is required.".into()));
    }

    let vault_path = normalize_vault_path(&path);
    let kdf = default_kdf_metadata();
    let payload = VaultPayload {
        vault_name: normalized_name,
        settings: VaultSettings::default(),
        entries: vec![],
    };
    let mut password = password;
    let key = crate::crypto::derive_key_from_password(&password, &kdf)?;
    password.zeroize();
    save_payload(&vault_path, &payload, key.as_slice(), &kdf)?;

    state.replace_session(VaultSession {
        vault_path: vault_path.clone(),
        kdf,
        key,
        payload,
    });
    prefs::record_recent_vault(&app, &vault_path.to_string_lossy())?;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn unlock_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    password: String,
) -> AppResult<AppSnapshot> {
    if password.trim().is_empty() {
        return Err(AppError::Validation("Master password is required.".into()));
    }

    let vault_path = normalize_vault_path(&path);
    let mut password = password;
    let (payload, kdf, key) = open_vault(&vault_path, &password)?;
    password.zeroize();
    state.replace_session(VaultSession {
        vault_path: vault_path.clone(),
        kdf,
        key,
        payload,
    });
    prefs::record_recent_vault(&app, &vault_path.to_string_lossy())?;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn lock_vault(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppSnapshot> {
    state.lock();
    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_vault_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: VaultSettings,
) -> AppResult<AppSnapshot> {
    settings.validate()?;
    state
        .with_session_mut(|session| {
            session.payload.settings = settings;
            persist_session(session)
        })
        .ok_or(AppError::VaultLocked)??;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn upsert_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    input: EntryUpsertInput,
) -> AppResult<AppSnapshot> {
    let is_create = input.id.is_none();
    input.validate(is_create)?;

    state
        .with_session_mut(|session| {
            let timestamp = now_timestamp();

            if let Some(existing_id) = &input.id {
                let entry = session
                    .payload
                    .entries
                    .iter_mut()
                    .find(|entry| entry.id == *existing_id)
                    .ok_or(AppError::EntryNotFound)?;
                let replacement_secret = input
                    .secret_value
                    .as_ref()
                    .filter(|value| !value.trim().is_empty())
                    .cloned();
                let secret_rotated = replacement_secret
                    .as_ref()
                    .map(|value| value != &entry.secret_value)
                    .unwrap_or(false);

                entry.name = normalize_string(input.name.clone());
                entry.provider = normalize_string(input.provider.clone());
                entry.env_var_name = normalize_string(input.env_var_name.clone());
                if let Some(secret) = replacement_secret {
                    entry.secret_value = secret;
                }
                entry.model_family = normalize_optional(input.model_family.clone());
                entry.models = normalize_list(input.models.clone());
                entry.tags = normalize_list(input.tags.clone());
                entry.notes = input.notes.trim().to_string();
                entry.environment = normalize_string(input.environment.clone());
                entry.agent_access_tags = normalize_list(input.agent_access_tags.clone());
                entry.status = input.status.clone();
                entry.updated_at = timestamp.clone();
                if secret_rotated {
                    entry.rotated_at = Some(timestamp.clone());
                }
            } else {
                session.payload.entries.push(VaultEntry {
                    id: input.new_id(),
                    name: normalize_string(input.name),
                    provider: normalize_string(input.provider),
                    env_var_name: normalize_string(input.env_var_name),
                    secret_value: input.secret_value.unwrap_or_default(),
                    model_family: normalize_optional(input.model_family),
                    models: normalize_list(input.models),
                    tags: normalize_list(input.tags),
                    notes: input.notes.trim().to_string(),
                    environment: normalize_string(input.environment),
                    agent_access_tags: normalize_list(input.agent_access_tags),
                    status: input.status,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                    rotated_at: Some(timestamp),
                    last_tested_at: None,
                    last_used_at: None,
                });
            }

            session
                .payload
                .entries
                .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
            persist_session(session)
        })
        .ok_or(AppError::VaultLocked)??;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<AppSnapshot> {
    state
        .with_session_mut(|session| {
            let original_len = session.payload.entries.len();
            session.payload.entries.retain(|entry| entry.id != id);
            if session.payload.entries.len() == original_len {
                return Err(AppError::EntryNotFound);
            }
            persist_session(session)
        })
        .ok_or(AppError::VaultLocked)??;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn mark_entry_rotated(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<AppSnapshot> {
    state
        .with_session_mut(|session| {
            let entry = session
                .payload
                .entries
                .iter_mut()
                .find(|entry| entry.id == id)
                .ok_or(AppError::EntryNotFound)?;
            let timestamp = now_timestamp();
            entry.rotated_at = Some(timestamp.clone());
            entry.updated_at = timestamp;
            persist_session(session)
        })
        .ok_or(AppError::VaultLocked)??;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn reveal_secret(state: State<'_, AppState>, id: String) -> AppResult<String> {
    state
        .with_session(|session| {
            session
                .payload
                .entries
                .iter()
                .find(|entry| entry.id == id)
                .map(|entry| entry.secret_value.clone())
                .ok_or(AppError::EntryNotFound)
        })
        .ok_or(AppError::VaultLocked)?
}

#[tauri::command(rename_all = "camelCase")]
pub fn copy_secret(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<AppSnapshot> {
    let clipboard_value = state
        .with_session_mut(|session| {
            let entry = session
                .payload
                .entries
                .iter_mut()
                .find(|entry| entry.id == id)
                .ok_or(AppError::EntryNotFound)?;
            let timestamp = now_timestamp();
            entry.last_used_at = Some(timestamp.clone());
            entry.updated_at = timestamp;
            let secret = entry.secret_value.clone();
            persist_session(session)?;
            Ok::<String, AppError>(secret)
        })
        .ok_or(AppError::VaultLocked)??;

    app.clipboard()
        .write_text(clipboard_value)
        .map_err(|_| AppError::Clipboard)?;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn preview_export(
    state: State<'_, AppState>,
    ids: Vec<String>,
    format: String,
) -> AppResult<String> {
    state
        .with_session(|session| exports::render_export(&session.payload, &ids, &format))
        .ok_or(AppError::VaultLocked)?
}

#[tauri::command(rename_all = "camelCase")]
pub fn copy_export(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
    format: String,
) -> AppResult<AppSnapshot> {
    let clipboard_value = state
        .with_session_mut(|session| {
            let rendered = exports::render_export(&session.payload, &ids, &format)?;
            let timestamp = now_timestamp();

            if ids.is_empty() {
                for entry in &mut session.payload.entries {
                    entry.last_used_at = Some(timestamp.clone());
                    entry.updated_at = timestamp.clone();
                }
            } else {
                for id in &ids {
                    let entry = session
                        .payload
                        .entries
                        .iter_mut()
                        .find(|entry| entry.id == *id)
                        .ok_or(AppError::EntryNotFound)?;
                    entry.last_used_at = Some(timestamp.clone());
                    entry.updated_at = timestamp.clone();
                }
            }

            persist_session(session)?;
            Ok::<String, AppError>(rendered)
        })
        .ok_or(AppError::VaultLocked)??;

    app.clipboard()
        .write_text(clipboard_value)
        .map_err(|_| AppError::Clipboard)?;

    build_snapshot(&app, &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_encrypted_backup(state: State<'_, AppState>, path: String) -> AppResult<String> {
    state
        .with_session(|session| {
            let backup_path = normalize_vault_path(&path);
            save_payload(
                &backup_path,
                &session.payload,
                session.key.as_slice(),
                &session.kdf,
            )?;
            Ok(backup_path.to_string_lossy().to_string())
        })
        .ok_or(AppError::VaultLocked)?
}

fn persist_session(session: &VaultSession) -> AppResult<()> {
    save_payload(
        &session.vault_path,
        &session.payload,
        session.key.as_slice(),
        &session.kdf,
    )
}

fn build_snapshot(app: &AppHandle, state: &State<'_, AppState>) -> AppResult<AppSnapshot> {
    Ok(AppSnapshot {
        recent_vaults: prefs::load_preferences(app)?.recent_vaults,
        session: state.snapshot(),
    })
}
