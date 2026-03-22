# OpenClaw workflow

CodexVault provides two OpenClaw-oriented export formats:

- `OpenClaw env`: `.env`-style output optimized for immediate operator use.
- `OpenClaw bundle JSON`: reviewable handoff format with env values, chosen entries, and skipped-entry diagnostics.

## Selection policy

When multiple entries map to the same OpenClaw env var:

1. `active` status wins over `old`.
2. `old` is used only when no `active` candidate exists.
3. `revoked` entries are excluded from env output.
4. Remaining duplicates are skipped with an explicit reason.

This keeps OpenClaw exports deterministic and auditable instead of silently choosing the newest or first entry.

## Provider mapping

CodexVault maps common providers to OpenClaw-style env names:

- `OpenAI` -> `OPENAI_API_KEY`
- `Anthropic` -> `ANTHROPIC_API_KEY`
- `Azure OpenAI` -> `AZURE_OPENAI_API_KEY`
- `OpenRouter` -> `OPENROUTER_API_KEY`
- `Groq` -> `GROQ_API_KEY`
- `Gemini/Google` -> `GEMINI_API_KEY`
- `xAI` -> `XAI_API_KEY`
- `Mistral` -> `MISTRAL_API_KEY`
- `Cohere` -> `COHERE_API_KEY`
- `DeepSeek` -> `DEEPSEEK_API_KEY`
- `Together` -> `TOGETHER_API_KEY`

Unknown providers fall back to the entry's `envVarName`.

## Output characteristics

- Copying an OpenClaw format from the UI opens a pre-copy selection report modal first.
- The report shows selected entries, skipped entries, and selection policy details before clipboard write.
- OpenClaw env output includes a short policy header and `skippedEntries` comments.
- OpenClaw bundle JSON includes:
  - `env`: resolved env var to secret map
  - `providers`: selected entries used in the export
  - `skipped`: excluded duplicates or revoked entries
  - `selectionPolicy`: explicit status and dedupe rules

See [templates/openclaw.env](../templates/openclaw.env) and [templates/openclaw-bundle.json](../templates/openclaw-bundle.json) for redacted examples.

## Boundary reminder

These exports are plaintext outputs by design. Once copied or pasted outside CodexVault, they are outside the encrypted vault boundary.
