# Windows release validation

Use this checklist before running `release_channel=trusted` (cross-platform trusted release).

## Environment

- Clean Windows 11 machine or VM
- No prior CodexVault installation
- Microsoft Defender and SmartScreen enabled

## Installer validation

1. Download the candidate installer artifact from CI.
2. Verify checksum against `SHA256SUMS`.
3. Verify Authenticode signature in file properties.
4. Run installer and confirm signer identity matches release policy.
5. Complete install without disabling security controls.

## Runtime validation

1. Launch CodexVault from the installed shortcut.
2. Create a throwaway vault and unlock it.
3. Add an entry, reveal secret, copy secret, and lock vault.
4. Confirm OpenClaw pre-copy selection report appears for OpenClaw copy actions.
5. Export encrypted backup and reopen it.
6. Uninstall CodexVault.
7. Confirm application removes install files cleanly.

## Report format

Use this structure in `windows_validation_report`:

- validator name or team
- machine/VM details
- installer artifact name
- signature subject observed
- checks executed
- pass/fail result
- any notes or deviations
