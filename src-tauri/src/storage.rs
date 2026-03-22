use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use tempfile::NamedTempFile;
use zeroize::Zeroizing;

use crate::{
    crypto::{decrypt_payload, derive_key_from_password, encrypt_payload},
    error::{AppError, AppResult},
    models::{KdfMetadata, VaultEnvelope, VaultPayload},
};

pub fn load_envelope(path: &Path) -> AppResult<VaultEnvelope> {
    let content = fs::read_to_string(path)?;
    let envelope: VaultEnvelope = serde_json::from_str(&content)?;
    Ok(envelope)
}

pub fn open_vault(
    path: &Path,
    password: &str,
) -> AppResult<(VaultPayload, KdfMetadata, Zeroizing<Vec<u8>>)> {
    let envelope = load_envelope(path)?;
    let key =
        derive_key_from_password(password, &envelope.kdf).map_err(|_| AppError::UnlockFailed)?;
    let payload = decrypt_payload(&envelope, key.as_slice())?;
    Ok((payload, envelope.kdf, key))
}

pub fn save_payload(
    path: &Path,
    payload: &VaultPayload,
    key: &[u8],
    kdf: &KdfMetadata,
) -> AppResult<()> {
    let envelope = encrypt_payload(payload, key, kdf)?;
    write_json_atomic(path, &envelope)
}

pub fn write_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    write_bytes_atomic(path, &bytes)
}

pub fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| {
        AppError::Validation("Vault files must be saved inside a valid directory.".into())
    })?;
    fs::create_dir_all(parent)?;

    let mut temp_file = NamedTempFile::new_in(parent)?;
    temp_file.write_all(bytes)?;
    temp_file.flush()?;

    match temp_file.persist(path) {
        Ok(_) => Ok(()),
        Err(error) => {
            #[cfg(target_os = "windows")]
            {
                if path.exists() {
                    fs::remove_file(path)?;
                }
                error
                    .file
                    .persist(path)
                    .map_err(|persist_error| AppError::Io {
                        source: persist_error.error,
                    })?;
                Ok(())
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(AppError::Io {
                    source: error.error,
                })
            }
        }
    }
}

pub fn normalize_vault_path(path: &str) -> PathBuf {
    let mut path_buf = PathBuf::from(path);
    if path_buf.extension().is_none() {
        path_buf.set_extension("cvault");
    }
    path_buf
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::{
        crypto::{default_kdf_metadata, derive_key_from_password},
        models::{VaultPayload, VaultSettings},
    };

    use super::{open_vault, save_payload};

    #[test]
    fn save_and_reload_round_trip_succeeds() {
        let temp_dir = tempdir().unwrap();
        let vault_path = temp_dir.path().join("codexvault-test.cvault");
        let payload = VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries: vec![],
        };
        let kdf = default_kdf_metadata();
        let key = derive_key_from_password("correct horse battery staple", &kdf).unwrap();

        save_payload(&vault_path, &payload, key.as_slice(), &kdf).unwrap();
        let (restored, _, _) = open_vault(&vault_path, "correct horse battery staple").unwrap();

        assert_eq!(restored.vault_name, "CodexVault");
    }
}
