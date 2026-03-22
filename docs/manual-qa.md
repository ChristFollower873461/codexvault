# Manual QA checklist

Use this checklist for an actual desktop release pass.

Use a throwaway vault and fake credentials. If you want a consistent demo dataset for screenshots and QA, generate one first with [demo-vault.md](./demo-vault.md).

## Preconditions

- Clean local checkout
- Verified build toolchain
- Throwaway master password
- One known fake secret string for disk inspection

## Create and unlock

1. Create a new vault.
2. Quit and reopen the app.
3. Unlock the vault successfully.
4. Attempt unlock with the wrong password and confirm the file is not corrupted.
5. Reopen the same vault from the recent-path list.

## Entry lifecycle

1. Add entries across multiple providers and environments.
2. Edit metadata without replacing the secret and confirm the secret remains unchanged after reopen.
3. Replace a secret and confirm the value updates and `rotatedAt` behavior still makes sense.
4. Delete an entry and confirm list state, details state, and persistence all stay consistent.

## Search and selection

1. Search by name, provider, notes, tags, environment, and agent access tags.
2. Confirm secrets never match search results.
3. Apply provider, environment, tag, and status filters together.
4. Confirm empty states distinguish “vault is empty” from “no filter match”.

## Secret handling

1. Confirm secrets are masked by default.
2. Reveal a secret and confirm it auto-hides after the configured timeout.
3. Reveal a secret, switch window focus, and confirm the revealed value clears.
4. Copy a secret and confirm clipboard auto-clear after the configured timeout if the clipboard still matches.

## Export handling

1. Preview each export format.
2. Copy each export format.
3. Switch export scope between selected entry and filtered set.
4. Confirm previews clear on timeout and on window blur.
5. Confirm nothing is written into live configs automatically.
6. For OpenClaw exports, confirm active keys are preferred over old keys and revoked keys are excluded.
7. Confirm OpenClaw bundle output includes `env`, `providers`, and `skipped` sections with consistent reasons.

## Storage inspection

1. Inspect the `.cvault` file and confirm it is an encrypted JSON envelope.
2. Search the file for the known fake secret string. It should not appear.
3. Inspect recent-file preferences and confirm they contain only path metadata.
4. Write an encrypted backup and reopen it successfully.

## Locking and session behavior

1. Trigger manual lock.
2. Trigger idle auto-lock.
3. After lock, confirm old reveal and export preview content is no longer visible.
4. Confirm the pending vault path remains available for fast re-unlock.

## Release gate

1. Run `npm run lint`.
2. Run `npm test`.
3. Run `npm run test:release-gate`.
4. Run `npm run cargo:test`.
5. Run `npm run tauri:smoke`.
6. If publishing macOS artifacts, run `npm run tauri:build`.
7. Run the `CodexVault Release` workflow with the intended `release_channel`.
8. If using `release_channel=trusted`, include Windows validation notes in `windows_validation_report`.
9. Verify `release-truth.json` matches the channel claim (`preview`, `partial-macos-trusted`, or `trusted-cross-platform`).
10. Re-read [README.md](../README.md), [SECURITY.md](../SECURITY.md), and [release.md](./release.md) for claim accuracy before tagging a release.
