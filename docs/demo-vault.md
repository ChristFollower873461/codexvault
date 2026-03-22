# Demo vault flow

CodexVault includes a repeatable demo-vault generator so screenshots, QA runs, and demos do not depend on hand-entered data.

## Generate the demo vault

```bash
source "$HOME/.cargo/env"
npm run demo:vault -- ./codexvault-demo.cvault codexvault-demo
```

This writes an encrypted vault containing fake credentials only.

## Open it

- Vault file: `./codexvault-demo.cvault`
- Password: `codexvault-demo`

## What it contains

- OpenAI production entry
- Anthropic research entry
- Azure OpenAI staging entry
- OpenRouter fallback entry
- Groq revoked entry

The metadata is intentionally varied so screenshots exercise the real UI surface:

- mixed providers
- multiple environments
- active, old, and revoked statuses
- model families and model lists
- tags, notes, and agent access tags
- rotation and last-used timestamps

## Screenshot guidance

- Keep secrets masked unless you are deliberately demonstrating the reveal flow.
- Use the filtered export scope toggle to show both selected-entry and filtered-set behavior.
- Prefer the generated demo vault over ad hoc screenshots so the product surface stays consistent across docs and releases.
