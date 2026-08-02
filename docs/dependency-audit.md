# Dependency Audit Posture

Last reviewed: 2026-08-01

CodexVault treats dependency freshness as a security boundary, but it does not upgrade across breaking major versions merely to make version numbers larger. The maintained baseline is the newest compatible line that passes the frontend, Rust, and desktop build gates.

## Current baseline

- Tauri runtime: `2.11.5`
- Tauri JavaScript API: `2.11.1`
- Tauri CLI: `2.11.4`
- React: `19.2.8`
- Vite: `8.2.0`
- Rust toolchain / MSRV: `1.94.0`

The Tauri update is security-relevant: versions through `2.11.0` were affected by an origin-confusion issue that could allow a remote page to invoke local-only IPC commands. The `2.11.1+` line enforces ACL resolution for remote origins.

## Required checks

```bash
npm ci
npm run lint
npm test
npm run test:release-gate
npm run build
npm audit --audit-level=low
cargo test --manifest-path src-tauri/Cargo.toml
cargo audit --file src-tauri/Cargo.lock
```

The `Quality` workflow runs these gates on pull requests and `main`.

## Known transitive warnings

The cross-platform Tauri lockfile includes GTK3 / `glib 0.18.x` packages for Linux builds. RustSec reports the GTK3 bindings as unmaintained and reports an unsound `glib::VariantStrIter` implementation fixed in `glib 0.20.0`.

CodexVault does not currently claim or publish a Linux release, does not directly depend on GTK or `glib`, and does not call `VariantStrIter`. Tauri's maintained Linux dependency line still selects GTK3 / `glib 0.18.x`, so the lockfile cannot be moved independently to `glib 0.20.x`. This is an explicit upstream constraint, not a silently ignored application dependency. Re-evaluate it when Tauri changes its Linux GUI stack or before claiming Linux support.

The release workflow remains limited to macOS and Windows. Any future Linux release must resolve or explicitly re-review this warning first.

## Scanner triage

CodeQL may identify hard-coded passwords in demo generators and tests. Those strings are synthetic fixtures used to prove encryption, failure handling, and the documented demo flow; they are not credentials. Each such alert must be reviewed at its exact source location before dismissal. Production credentials must never be added to fixtures, examples, documentation, or browser-demo data.
