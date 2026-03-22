# Vault file format

CodexVault stores vaults as encrypted `.cvault` files.

The on-disk file is a JSON envelope that contains versioning and KDF metadata plus ciphertext for the full vault payload.

## Envelope structure

```json
{
  "format": "codexvault",
  "version": 1,
  "kdf": {
    "algorithm": "argon2id",
    "memoryKiB": 65536,
    "iterations": 3,
    "parallelism": 1,
    "saltB64": "..."
  },
  "cipher": {
    "algorithm": "aes-256-gcm",
    "nonceB64": "...",
    "ciphertextB64": "..."
  }
}
```

## Payload before encryption

```json
{
  "vaultName": "CodexVault",
  "settings": {
    "idleLockMinutes": 10,
    "clipboardClearSeconds": 30,
    "revealAutoHideSeconds": 12
  },
  "entries": [
    {
      "id": "entry-1",
      "name": "OpenAI Primary",
      "provider": "OpenAI",
      "envVarName": "OPENAI_API_KEY",
      "secretValue": "sk-...",
      "modelFamily": "gpt-4.1",
      "models": ["gpt-4.1", "gpt-4.1-mini"],
      "tags": ["prod", "billing"],
      "notes": "Primary operator key",
      "environment": "production",
      "agentAccessTags": ["writer", "monitor"],
      "status": "active",
      "createdAt": "2026-03-01T09:15:00Z",
      "updatedAt": "2026-03-21T11:05:00Z",
      "rotatedAt": "2026-03-14T10:00:00Z",
      "lastTestedAt": "2026-03-21T10:55:00Z",
      "lastUsedAt": "2026-03-21T11:05:00Z"
    }
  ]
}
```

The ciphertext covers the full payload, including metadata, notes, timestamps, and secret values.

## Authenticated metadata

The envelope uses `AES-256-GCM` with associated authenticated data bound to:

- `format`
- `version`
- the full `kdf` block
- the cipher algorithm identifier

That means tampering with version or KDF metadata is part of the authenticated envelope boundary, not just the ciphertext payload.

## Validation rules

- `format` must be `codexvault`
- `version` must be `1`
- `kdf.algorithm` must be `argon2id`
- `cipher.algorithm` must be `aes-256-gcm`

If any of those fields do not match, the file is rejected as unsupported.

## What is outside the vault file

The `.cvault` file does not contain:

- recent vault path history
- window state
- system clipboard contents
- any separate plaintext search index

Recent vault paths are stored separately in local app preferences so the app can offer a recent-files list.

## Compatibility approach

Version `1` is the initial public format. Future compatibility changes should:

- increment the envelope `version`
- keep old readers strict rather than guessing
- document migration behavior explicitly in release notes
