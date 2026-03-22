# CodexVault

CodexVault is a local-first encrypted API key vault for AI operators.

It keeps provider credentials, model metadata, operator notes, and export-ready snippets in a single encrypted `.cvault` file under the operator's control. There is no cloud backend, no telemetry, and no automatic writes into live configs.

## Core properties

- Local-first only. No sync service, hosted backend, or remote content.
- `Argon2id` for password-based key derivation.
- `AES-256-GCM` for full-payload encryption at rest.
- Secrets masked by default, with explicit reveal and copy actions.
- Metadata-only search and filtering. `secretValue` is never searchable.
- Whole-vault encrypted backup export in the same `.cvault` format.
- Clean operator exports for `.env`, generic JSON, provider snippets, deterministic OpenClaw env blocks, and OpenClaw bundle JSON.

## What the app is for

CodexVault is meant for a single operator who wants a serious local desktop vault for AI provider keys and related metadata:

- one encrypted vault file instead of plaintext notes or ad hoc shell history
- deliberate reveal and copy flows instead of background config mutation
- export-ready snippets for real operator workflows
- clear boundaries about what the app protects and what it does not

## Security boundary

CodexVault protects the encrypted vault file at rest and reduces accidental disclosure in normal UI flows.

It does not claim to protect against host compromise, malware, memory inspection, screenshots, swap, crash dumps, or plaintext after you explicitly reveal, copy, or export it.

Read [SECURITY.md](./SECURITY.md) for the exact threat boundary and the current packaging trust status.

## Why Tauri

CodexVault uses `Tauri + React + TypeScript`.

- Rust handles crypto, vault I/O, session state, and export rendering.
- The React UI stays focused on operator workflow and presentation.
- Security-sensitive code stays out of a browser-like Electron main or preload boundary.

## Current release status

- Verified locally on macOS with `npm run lint`, `npm test`, `npm run cargo:test`, `npm run tauri:smoke`, and `npm run tauri:build`.
- Local macOS `.app` and `.dmg` packaging succeeds.
- No signed Windows binaries are shipped.
- No notarized macOS release is shipped.
- Windows has CI desktop smoke coverage, but not a manually release-validated package in this repository yet.
- No external security audit has been completed.
- `preview`, `partial`, and `trusted` release channels are implemented in `.github/workflows/codexvault-release.yml`.

The recommended trust path today is still: build from source, review the code, and treat distributed binaries as untrusted until signing and notarization are in place.

## Demo vault and screenshots

CodexVault includes a repeatable demo-vault generator for screenshots, QA, and demos. It writes an encrypted vault containing fake credentials and realistic metadata.

```bash
source "$HOME/.cargo/env"
npm run demo:vault -- ./codexvault-demo.cvault codexvault-demo
```

Open the generated vault in the app with the password `codexvault-demo`.

See [docs/demo-vault.md](./docs/demo-vault.md) for the full flow and the curated sample entries it creates.

## OpenClaw workflow

CodexVault treats OpenClaw export as a first-class path:

- `OpenClaw env` export produces one key per mapped provider env var.
- Selection is deterministic: `active` entries win, `old` entries are fallback, `revoked` entries are excluded.
- Duplicate and revoked candidates are surfaced as `skippedEntries` comments.
- `OpenClaw bundle JSON` includes the env map plus selected entry metadata and skipped-entry diagnostics for reviewable handoff.

See [docs/openclaw-workflow.md](./docs/openclaw-workflow.md) for details and example outputs.

## Quick start

### Prerequisites

- Node.js 22+
- npm 10+
- Rust stable toolchain
- macOS Command Line Tools or Visual Studio Build Tools on Windows

Reference: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
cd codexvault
npm install
```

### Development

```bash
source "$HOME/.cargo/env"
npm run tauri:dev
```

### Verification

```bash
npm run lint
npm test
npm run test:release-gate
npm run cargo:test
npm run tauri:smoke
```

### Local packaging

```bash
source "$HOME/.cargo/env"
npm run tauri:build
```

`tauri:smoke` is the baseline desktop compile check. `tauri:build` produces local artifacts, but they are not signed or notarized.

For signed/notarized release automation and artifact truth policy, see [docs/release.md](./docs/release.md).

For an honest mixed-trust release, use `release_channel=partial` and publish with these exact labels:

- `macOS (Signed + Notarized)`
- `Windows (Unsigned Preview / Early Access)`
- `Trust status: Partial. macOS artifacts are signed and notarized. Windows artifacts are unsigned preview.`

## Architecture at a glance

```text
React UI
  -> Tauri commands
  -> Rust session state
  -> encrypted .cvault envelope on disk
```

- The UI requests explicit actions: create, unlock, reveal, copy, export, lock.
- Rust derives the vault key, decrypts and re-encrypts the full payload, and persists it atomically.
- The unlocked payload exists only in process memory for the active session.
- Recent vault paths are stored separately from the encrypted vault so the app can offer a recent-files list.

See [docs/architecture.md](./docs/architecture.md) for the fuller system breakdown.

## Repo layout

```text
codexvault/
  src/                    React UI
  src-tauri/src/          Rust commands, crypto, storage, exports, demo generator
  src-tauri/capabilities/ Tauri permissions
  templates/              Redacted export examples
  docs/                   Architecture, security, release, QA, and demo docs
```

## Documentation

- [Security boundary](./SECURITY.md)
- [Architecture](./docs/architecture.md)
- [Vault file format](./docs/file-format.md)
- [Demo vault flow](./docs/demo-vault.md)
- [OpenClaw workflow](./docs/openclaw-workflow.md)
- [Manual QA checklist](./docs/manual-qa.md)
- [Windows release validation](./docs/windows-validation.md)
- [Release and packaging status](./docs/release.md)

## Scope and non-goals

CodexVault intentionally does not:

- sync to a cloud service
- auto-write into live config files
- run provider “test key” checks in the background
- collect analytics or telemetry
- claim to solve every desktop threat model
- treat unsigned binaries as equivalent to trusted releases

## License

MIT. See [LICENSE](./LICENSE).
