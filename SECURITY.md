# Security boundary

CodexVault is a local-first single-user desktop vault. Its job is to protect vault contents at rest and reduce accidental disclosure during normal use.

It is not trying to be enterprise secret distribution, host-compromise protection, or forensic-resistant local storage.

## Threat model

CodexVault is designed for this shape of problem:

- one operator
- one local machine
- one encrypted vault file
- deliberate reveal, copy, and export actions
- no backend, no telemetry, no automatic config mutation

## Protected by design

- The full vault payload inside the `.cvault` file is encrypted at rest.
- Entry metadata is encrypted at rest along with secret values.
- The master password is not stored by the app.
- List, filter, and search flows exclude `secretValue`.
- Normal vault saves do not write plaintext secret files or plaintext secret databases to disk.

## Explicitly not protected

- A compromised host
- Malware, keyloggers, injected devtools, or memory inspection
- Plaintext after the user explicitly reveals, copies, or exports it
- Clipboard contents after copy beyond best-effort auto-clear
- OS-level metadata such as file paths, timestamps, swap, hibernation, screenshots, and crash dumps
- Binary authenticity for unsigned or unnotarized builds

## Implemented controls

- `Argon2id` with per-vault random salt and persisted KDF parameters
- `AES-256-GCM` with a fresh nonce on every save
- Full-payload encryption, not field-level “secret only” encryption
- Authenticated metadata binding for format, version, KDF metadata, and cipher algorithm
- Atomic encrypted writes to disk
- Explicit reveal actions for secrets
- Plaintext reveal and export previews auto-clear from the UI after a timeout and on window blur
- Manual lock and idle auto-lock
- Clipboard auto-clear support
- Redacted Rust-side debug output for secret-bearing data structures
- No telemetry and no remote content dependencies

## Plaintext exposure points

The important question is where plaintext still exists. In CodexVault, plaintext can exist in these places:

- Rust process memory while the vault is unlocked
- Renderer memory during explicit reveal, export preview, and entry submit flows
- The system clipboard after explicit copy
- External apps, shells, or files once the user pastes or exports plaintext outside the vault

The secret-entry form no longer keeps the secret field in React-managed form state, but that does not eliminate renderer plaintext entirely.

## Packaging and authenticity status

- Source builds are the recommended trust path today.
- `npm run tauri:smoke` is the verified compile path used for local validation and CI smoke checks.
- Local macOS packaging currently succeeds, but the produced `.app` and `.dmg` artifacts are unsigned and unnotarized.
- `preview`, `partial`, and `trusted` release channels are automated in `.github/workflows/codexvault-release.yml`.
- `partial` requires signed+notarized macOS and allows Windows preview artifacts.
- `trusted` requires signed+notarized macOS, signed Windows artifacts, and explicit Windows manual validation input.
- Artifact trust status is emitted as `release-truth.json`; anything else should be treated as preview.

## Operational guidance

- Use a strong unique master password.
- Lock the vault when stepping away.
- Treat copied and exported plaintext as short-lived sensitive material.
- Prefer encrypted backup copies over plaintext exports.
- Keep the OS, WebView runtime, and Rust dependencies current.

## Reporting issues

If you discover a security issue, report it privately before opening a public issue if possible. Include:

- affected version or commit
- reproduction steps
- practical impact
- any mitigation or workaround
