use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde_json::json;
use zeroize::Zeroizing;

use crate::{
    error::{AppError, AppResult},
    models::{
        CipherMetadata, KdfMetadata, VaultEnvelope, VaultPayload, VAULT_FORMAT, VAULT_VERSION,
    },
};

const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const SALT_LEN: usize = 16;

pub fn default_kdf_metadata() -> KdfMetadata {
    let mut salt = [0_u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);

    KdfMetadata {
        algorithm: "argon2id".into(),
        memory_kib: 65_536,
        iterations: 3,
        parallelism: 1,
        salt_b64: STANDARD.encode(salt),
    }
}

pub fn derive_key_from_password(
    password: &str,
    kdf: &KdfMetadata,
) -> AppResult<Zeroizing<Vec<u8>>> {
    if kdf.algorithm != "argon2id" {
        return Err(AppError::UnsupportedVaultFormat);
    }

    let salt = STANDARD
        .decode(&kdf.salt_b64)
        .map_err(|_| AppError::UnsupportedVaultFormat)?;
    let params = Params::new(
        kdf.memory_kib,
        kdf.iterations,
        kdf.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|_| AppError::Crypto)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new(vec![0_u8; KEY_LEN]);
    argon2
        .hash_password_into(password.as_bytes(), &salt, key.as_mut_slice())
        .map_err(|_| AppError::Crypto)?;

    Ok(key)
}

pub fn encrypt_payload(
    payload: &VaultPayload,
    key: &[u8],
    kdf: &KdfMetadata,
) -> AppResult<VaultEnvelope> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Crypto)?;
    let mut nonce = [0_u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let aad = aad_bytes(kdf)?;
    let plaintext = Zeroizing::new(serde_json::to_vec(payload)?);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext.as_slice(),
                aad: aad.as_slice(),
            },
        )
        .map_err(|_| AppError::Crypto)?;

    Ok(VaultEnvelope {
        format: VAULT_FORMAT.into(),
        version: VAULT_VERSION,
        kdf: kdf.clone(),
        cipher: CipherMetadata {
            algorithm: "aes-256-gcm".into(),
            nonce_b64: STANDARD.encode(nonce),
            ciphertext_b64: STANDARD.encode(ciphertext),
        },
    })
}

pub fn decrypt_payload(envelope: &VaultEnvelope, key: &[u8]) -> AppResult<VaultPayload> {
    if envelope.format != VAULT_FORMAT || envelope.version != VAULT_VERSION {
        return Err(AppError::UnsupportedVaultFormat);
    }
    if envelope.cipher.algorithm != "aes-256-gcm" {
        return Err(AppError::UnsupportedVaultFormat);
    }

    let nonce = STANDARD
        .decode(&envelope.cipher.nonce_b64)
        .map_err(|_| AppError::UnlockFailed)?;
    let ciphertext = STANDARD
        .decode(&envelope.cipher.ciphertext_b64)
        .map_err(|_| AppError::UnlockFailed)?;
    let aad = aad_bytes(&envelope.kdf)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Crypto)?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: ciphertext.as_slice(),
                aad: aad.as_slice(),
            },
        )
        .map_err(|_| AppError::UnlockFailed)?;

    serde_json::from_slice(&plaintext).map_err(|_| AppError::UnlockFailed)
}

fn aad_bytes(kdf: &KdfMetadata) -> AppResult<Vec<u8>> {
    Ok(serde_json::to_vec(&json!({
      "format": VAULT_FORMAT,
      "version": VAULT_VERSION,
      "kdf": kdf,
      "cipherAlgorithm": "aes-256-gcm"
    }))?)
}

#[cfg(test)]
mod tests {
    use crate::models::{VaultPayload, VaultSettings};

    use super::{decrypt_payload, default_kdf_metadata, derive_key_from_password, encrypt_payload};

    #[test]
    fn encrypt_round_trip_succeeds() {
        let payload = VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries: vec![],
        };
        let kdf = default_kdf_metadata();
        let key = derive_key_from_password("correct horse battery staple", &kdf).unwrap();
        let envelope = encrypt_payload(&payload, key.as_slice(), &kdf).unwrap();
        let restored = decrypt_payload(&envelope, key.as_slice()).unwrap();

        assert_eq!(restored.vault_name, "CodexVault");
    }

    #[test]
    fn wrong_key_fails_decryption() {
        let payload = VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries: vec![],
        };
        let kdf = default_kdf_metadata();
        let key = derive_key_from_password("correct horse battery staple", &kdf).unwrap();
        let wrong_key = derive_key_from_password("totally wrong password", &kdf).unwrap();
        let envelope = encrypt_payload(&payload, key.as_slice(), &kdf).unwrap();

        assert!(decrypt_payload(&envelope, wrong_key.as_slice()).is_err());
    }

    #[test]
    fn tampering_is_detected() {
        let payload = VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries: vec![],
        };
        let kdf = default_kdf_metadata();
        let key = derive_key_from_password("correct horse battery staple", &kdf).unwrap();
        let mut envelope = encrypt_payload(&payload, key.as_slice(), &kdf).unwrap();
        envelope.cipher.ciphertext_b64.pop();
        envelope.cipher.ciphertext_b64.push('A');

        assert!(decrypt_payload(&envelope, key.as_slice()).is_err());
    }
}
