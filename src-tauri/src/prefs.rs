use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::{
    error::{AppError, AppResult},
    models::{now_timestamp, AppPreferences, RecentVault},
    storage::write_json_atomic,
};

pub fn load_preferences(app: &AppHandle) -> AppResult<AppPreferences> {
    let path = preferences_path(app)?;
    if !path.exists() {
        return Ok(AppPreferences::default());
    }

    let content = fs::read_to_string(path).map_err(|_| AppError::Preferences)?;
    serde_json::from_str(&content).map_err(|_| AppError::Preferences)
}

pub fn record_recent_vault(app: &AppHandle, path: &str) -> AppResult<()> {
    let mut preferences = load_preferences(app)?;
    preferences.recent_vaults.retain(|item| item.path != path);
    preferences.recent_vaults.insert(
        0,
        RecentVault {
            path: path.into(),
            file_name: PathBuf::from(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("vault.cvault")
                .to_string(),
            last_opened_at: now_timestamp(),
        },
    );
    preferences.recent_vaults.truncate(8);
    save_preferences(app, &preferences)
}

fn save_preferences(app: &AppHandle, preferences: &AppPreferences) -> AppResult<()> {
    let path = preferences_path(app)?;
    write_json_atomic(&path, preferences).map_err(|_| AppError::Preferences)
}

fn preferences_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| AppError::Preferences)?;
    fs::create_dir_all(&dir).map_err(|_| AppError::Preferences)?;
    Ok(dir.join("preferences.json"))
}
