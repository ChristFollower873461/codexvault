use serde::ser::{Serialize, Serializer};
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("Vault is locked.")]
    VaultLocked,
    #[error("Vault item was not found.")]
    EntryNotFound,
    #[error("Password is invalid or the vault data is corrupted.")]
    UnlockFailed,
    #[error("The selected file is not a supported CodexVault vault.")]
    UnsupportedVaultFormat,
    #[error("The vault file could not be read or written.")]
    Io {
        #[source]
        source: std::io::Error,
    },
    #[error("The vault data could not be serialized safely.")]
    Serialization {
        #[source]
        source: serde_json::Error,
    },
    #[error("The vault could not be encrypted or decrypted safely.")]
    Crypto,
    #[error("Clipboard access failed.")]
    Clipboard,
    #[error("Recent vault preferences could not be updated.")]
    Preferences,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(source: std::io::Error) -> Self {
        Self::Io { source }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(source: serde_json::Error) -> Self {
        Self::Serialization { source }
    }
}
