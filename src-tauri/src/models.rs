use std::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{AppError, AppResult};

pub const VAULT_FORMAT: &str = "codexvault";
pub const VAULT_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    Active,
    Old,
    Revoked,
}

impl Default for EntryStatus {
    fn default() -> Self {
        Self::Active
    }
}

impl Zeroize for EntryStatus {
    fn zeroize(&mut self) {
        *self = Self::Active;
    }
}

impl ZeroizeOnDrop for EntryStatus {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    pub idle_lock_minutes: u16,
    pub clipboard_clear_seconds: u16,
    pub reveal_auto_hide_seconds: u16,
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            idle_lock_minutes: 10,
            clipboard_clear_seconds: 30,
            reveal_auto_hide_seconds: 12,
        }
    }
}

impl VaultSettings {
    pub fn validate(&self) -> AppResult<()> {
        if !(1..=240).contains(&self.idle_lock_minutes) {
            return Err(AppError::Validation(
                "Idle auto-lock must be between 1 and 240 minutes.".into(),
            ));
        }
        if !(5..=300).contains(&self.clipboard_clear_seconds) {
            return Err(AppError::Validation(
                "Clipboard clear timeout must be between 5 and 300 seconds.".into(),
            ));
        }
        if !(3..=120).contains(&self.reveal_auto_hide_seconds) {
            return Err(AppError::Validation(
                "Reveal timeout must be between 3 and 120 seconds.".into(),
            ));
        }
        Ok(())
    }
}

impl Zeroize for VaultSettings {
    fn zeroize(&mut self) {
        self.idle_lock_minutes.zeroize();
        self.clipboard_clear_seconds.zeroize();
        self.reveal_auto_hide_seconds.zeroize();
    }
}

impl ZeroizeOnDrop for VaultSettings {}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub env_var_name: String,
    pub secret_value: String,
    pub model_family: Option<String>,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub agent_access_tags: Vec<String>,
    #[serde(default)]
    pub status: EntryStatus,
    pub created_at: String,
    pub updated_at: String,
    pub rotated_at: Option<String>,
    pub last_tested_at: Option<String>,
    pub last_used_at: Option<String>,
}

impl VaultEntry {
    pub fn to_record(&self) -> VaultEntryRecord {
        VaultEntryRecord {
            id: self.id.clone(),
            name: self.name.clone(),
            provider: self.provider.clone(),
            env_var_name: self.env_var_name.clone(),
            model_family: self.model_family.clone(),
            models: self.models.clone(),
            tags: self.tags.clone(),
            notes: self.notes.clone(),
            environment: self.environment.clone(),
            agent_access_tags: self.agent_access_tags.clone(),
            status: self.status.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            rotated_at: self.rotated_at.clone(),
            last_tested_at: self.last_tested_at.clone(),
            last_used_at: self.last_used_at.clone(),
        }
    }
}

impl fmt::Debug for VaultEntry {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("VaultEntry")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("provider", &self.provider)
            .field("envVarName", &self.env_var_name)
            .field("secretValue", &"[REDACTED]")
            .field("modelFamily", &self.model_family)
            .field("models", &self.models)
            .field("tags", &self.tags)
            .field("notes", &self.notes)
            .field("environment", &self.environment)
            .field("agentAccessTags", &self.agent_access_tags)
            .field("status", &self.status)
            .field("createdAt", &self.created_at)
            .field("updatedAt", &self.updated_at)
            .field("rotatedAt", &self.rotated_at)
            .field("lastTestedAt", &self.last_tested_at)
            .field("lastUsedAt", &self.last_used_at)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntryRecord {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub env_var_name: String,
    pub model_family: Option<String>,
    pub models: Vec<String>,
    pub tags: Vec<String>,
    pub notes: String,
    pub environment: String,
    pub agent_access_tags: Vec<String>,
    pub status: EntryStatus,
    pub created_at: String,
    pub updated_at: String,
    pub rotated_at: Option<String>,
    pub last_tested_at: Option<String>,
    pub last_used_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct VaultPayload {
    pub vault_name: String,
    #[serde(default)]
    pub settings: VaultSettings,
    #[serde(default)]
    pub entries: Vec<VaultEntry>,
}

impl fmt::Debug for VaultPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("VaultPayload")
            .field("vaultName", &self.vault_name)
            .field("settings", &self.settings)
            .field("entryCount", &self.entries.len())
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KdfMetadata {
    pub algorithm: String,
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub salt_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CipherMetadata {
    pub algorithm: String,
    pub nonce_b64: String,
    pub ciphertext_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultEnvelope {
    pub format: String,
    pub version: u8,
    pub kdf: KdfMetadata,
    pub cipher: CipherMetadata,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockedVaultSnapshot {
    pub vault_name: String,
    pub current_path: String,
    pub settings: VaultSettings,
    pub entries: Vec<VaultEntryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentVault {
    pub path: String,
    pub file_name: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub recent_vaults: Vec<RecentVault>,
    pub session: Option<UnlockedVaultSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default)]
    pub recent_vaults: Vec<RecentVault>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryUpsertInput {
    pub id: Option<String>,
    pub name: String,
    pub provider: String,
    pub env_var_name: String,
    pub secret_value: Option<String>,
    pub model_family: Option<String>,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub agent_access_tags: Vec<String>,
    #[serde(default)]
    pub status: EntryStatus,
}

impl EntryUpsertInput {
    pub fn new_id(&self) -> String {
        self.id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string())
    }

    pub fn validate(&self, is_create: bool) -> AppResult<()> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation("Entry name is required.".into()));
        }
        if self.provider.trim().is_empty() {
            return Err(AppError::Validation("Provider is required.".into()));
        }
        if self.env_var_name.trim().is_empty() {
            return Err(AppError::Validation(
                "Environment variable name is required.".into(),
            ));
        }
        if !is_valid_env_var(self.env_var_name.trim()) {
            return Err(AppError::Validation(
                "Environment variable names may only use letters, digits, and underscores.".into(),
            ));
        }
        if is_create
            && self
                .secret_value
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            return Err(AppError::Validation(
                "Secret value is required for new entries.".into(),
            ));
        }
        Ok(())
    }
}

pub fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub fn normalize_string(value: String) -> String {
    value.trim().to_string()
}

pub fn normalize_list(values: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::<String>::new();
    for value in values {
        let normalized = value.trim().to_string();
        if normalized.is_empty() || deduped.contains(&normalized) {
            continue;
        }
        deduped.push(normalized);
    }
    deduped
}

pub fn is_valid_env_var(candidate: &str) -> bool {
    let mut chars = candidate.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|char| char == '_' || char.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::{
        now_timestamp, EntryStatus, EntryUpsertInput, VaultEntry, VaultPayload, VaultSettings,
    };

    #[test]
    fn debug_output_redacts_secret_values() {
        let entry = VaultEntry {
            id: "entry-1".into(),
            name: "OpenAI".into(),
            provider: "OpenAI".into(),
            env_var_name: "OPENAI_API_KEY".into(),
            secret_value: "sk-secret".into(),
            model_family: Some("gpt-4.1".into()),
            models: vec!["gpt-4.1".into()],
            tags: vec!["prod".into()],
            notes: "Primary".into(),
            environment: "production".into(),
            agent_access_tags: vec!["writer".into()],
            status: EntryStatus::Active,
            created_at: now_timestamp(),
            updated_at: now_timestamp(),
            rotated_at: None,
            last_tested_at: None,
            last_used_at: None,
        };

        let formatted = format!("{entry:?}");
        assert!(!formatted.contains("sk-secret"));
        assert!(formatted.contains("[REDACTED]"));
    }

    #[test]
    fn payload_debug_only_reports_count() {
        let payload = VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries: vec![],
        };

        let formatted = format!("{payload:?}");
        assert!(formatted.contains("entryCount"));
    }

    #[test]
    fn create_validation_rejects_blank_secret_but_preserves_raw_value() {
        let input = EntryUpsertInput {
            id: None,
            name: "OpenAI".into(),
            provider: "OpenAI".into(),
            env_var_name: "OPENAI_API_KEY".into(),
            secret_value: Some("  sk-demo-value  ".into()),
            model_family: None,
            models: vec![],
            tags: vec![],
            notes: String::new(),
            environment: String::new(),
            agent_access_tags: vec![],
            status: EntryStatus::Active,
        };

        assert!(input.validate(true).is_ok());
        assert_eq!(input.secret_value.as_deref(), Some("  sk-demo-value  "));
    }
}
