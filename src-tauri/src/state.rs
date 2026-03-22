use std::path::PathBuf;

use parking_lot::Mutex;
use zeroize::Zeroizing;

use crate::models::{KdfMetadata, UnlockedVaultSnapshot, VaultPayload};

#[derive(Default)]
pub struct AppState {
    session: Mutex<Option<VaultSession>>,
}

pub struct VaultSession {
    pub vault_path: PathBuf,
    pub kdf: KdfMetadata,
    pub key: Zeroizing<Vec<u8>>,
    pub payload: VaultPayload,
}

impl AppState {
    pub fn replace_session(&self, session: VaultSession) {
        *self.session.lock() = Some(session);
    }

    pub fn lock(&self) {
        *self.session.lock() = None;
    }

    pub fn snapshot(&self) -> Option<UnlockedVaultSnapshot> {
        self.session
            .lock()
            .as_ref()
            .map(|session| UnlockedVaultSnapshot {
                vault_name: session.payload.vault_name.clone(),
                current_path: session.vault_path.to_string_lossy().to_string(),
                settings: session.payload.settings.clone(),
                entries: session
                    .payload
                    .entries
                    .iter()
                    .map(|entry| entry.to_record())
                    .collect(),
            })
    }

    pub fn with_session<T>(&self, action: impl FnOnce(&VaultSession) -> T) -> Option<T> {
        self.session.lock().as_ref().map(action)
    }

    pub fn with_session_mut<T>(&self, action: impl FnOnce(&mut VaultSession) -> T) -> Option<T> {
        self.session.lock().as_mut().map(action)
    }
}
