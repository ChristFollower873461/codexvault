use std::path::{Path, PathBuf};

use zeroize::Zeroize;

use crate::{
    crypto::{default_kdf_metadata, derive_key_from_password},
    models::{EntryStatus, VaultEntry, VaultPayload, VaultSettings},
    storage::{normalize_vault_path, save_payload},
};

pub fn write_demo_vault(path: &Path, password: &str) -> Result<PathBuf, String> {
    if password.trim().is_empty() {
        return Err("Demo vault password is required.".into());
    }

    let kdf = default_kdf_metadata();
    let mut password = password.to_string();
    let key = derive_key_from_password(&password, &kdf).map_err(|error| error.to_string())?;
    password.zeroize();

    let normalized_path = normalize_vault_path(&path.to_string_lossy());
    let payload = demo_payload();
    save_payload(&normalized_path, &payload, key.as_slice(), &kdf)
        .map_err(|error| error.to_string())?;

    Ok(normalized_path)
}

fn demo_payload() -> VaultPayload {
    VaultPayload {
        vault_name: "CodexVault Demo".into(),
        settings: VaultSettings {
            idle_lock_minutes: 10,
            clipboard_clear_seconds: 30,
            reveal_auto_hide_seconds: 12,
        },
        entries: vec![
            demo_entry(
                "anthropic-research",
                "Anthropic Research",
                "Anthropic",
                "ANTHROPIC_API_KEY",
                "demo-anthropic-research-2026",
                Some("claude"),
                vec!["claude-sonnet-4"],
                vec!["research", "analysis"],
                "Research workspace key for model comparisons and eval runs.",
                "research",
                vec!["analyst", "writer"],
                EntryStatus::Active,
                "2026-03-08T14:00:00Z",
                "2026-03-20T16:12:00Z",
                Some("2026-03-19T09:30:00Z"),
                Some("2026-03-20T15:40:00Z"),
                Some("2026-03-20T16:12:00Z"),
            ),
            demo_entry(
                "azure-openai-staging",
                "Azure OpenAI Staging",
                "Azure OpenAI",
                "AZURE_OPENAI_API_KEY",
                "demo-azure-openai-staging-2026",
                Some("gpt-4.1"),
                vec!["gpt-4.1", "gpt-4.1-mini"],
                vec!["staging", "integration"],
                "Staging credential for tenant-specific smoke tests and rollout checks.",
                "staging",
                vec!["monitor", "release"],
                EntryStatus::Active,
                "2026-03-05T12:20:00Z",
                "2026-03-18T18:25:00Z",
                Some("2026-03-18T18:25:00Z"),
                Some("2026-03-18T18:10:00Z"),
                Some("2026-03-18T18:25:00Z"),
            ),
            demo_entry(
                "openai-primary",
                "OpenAI Primary",
                "OpenAI",
                "OPENAI_API_KEY",
                "demo-openai-primary-2026",
                Some("gpt-4.1"),
                vec!["gpt-4.1", "gpt-4.1-mini"],
                vec!["prod", "writing", "billing"],
                "Primary operator key for production writing and routing workflows.",
                "production",
                vec!["writer", "monitor"],
                EntryStatus::Active,
                "2026-03-01T09:15:00Z",
                "2026-03-21T11:05:00Z",
                Some("2026-03-14T10:00:00Z"),
                Some("2026-03-21T10:55:00Z"),
                Some("2026-03-21T11:05:00Z"),
            ),
            demo_entry(
                "openrouter-fallback",
                "OpenRouter Fallback",
                "OpenRouter",
                "OPENROUTER_API_KEY",
                "demo-openrouter-fallback-2026",
                Some("routing"),
                vec!["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4"],
                vec!["fallback", "routing"],
                "Shared routing credential kept for fallback and provider failover testing.",
                "shared",
                vec!["monitor", "router"],
                EntryStatus::Old,
                "2026-02-14T11:10:00Z",
                "2026-03-11T13:40:00Z",
                Some("2026-03-01T08:15:00Z"),
                Some("2026-03-11T13:40:00Z"),
                Some("2026-03-11T13:40:00Z"),
            ),
            demo_entry(
                "groq-benchmarks",
                "Groq Benchmarks",
                "Groq",
                "GROQ_API_KEY",
                "demo-groq-revoked-2026",
                Some("llama"),
                vec!["llama-3.3-70b-versatile"],
                vec!["benchmark", "revoked"],
                "Retained for history only. Do not use for active workloads.",
                "archived",
                vec!["benchmark"],
                EntryStatus::Revoked,
                "2026-01-28T15:45:00Z",
                "2026-03-07T12:00:00Z",
                Some("2026-02-12T09:00:00Z"),
                Some("2026-02-21T16:05:00Z"),
                Some("2026-02-21T16:05:00Z"),
            ),
        ],
    }
}

#[allow(clippy::too_many_arguments)]
fn demo_entry(
    id: &str,
    name: &str,
    provider: &str,
    env_var_name: &str,
    secret_value: &str,
    model_family: Option<&str>,
    models: Vec<&str>,
    tags: Vec<&str>,
    notes: &str,
    environment: &str,
    agent_access_tags: Vec<&str>,
    status: EntryStatus,
    created_at: &str,
    updated_at: &str,
    rotated_at: Option<&str>,
    last_tested_at: Option<&str>,
    last_used_at: Option<&str>,
) -> VaultEntry {
    VaultEntry {
        id: id.into(),
        name: name.into(),
        provider: provider.into(),
        env_var_name: env_var_name.into(),
        secret_value: secret_value.into(),
        model_family: model_family.map(str::to_string),
        models: models.into_iter().map(str::to_string).collect(),
        tags: tags.into_iter().map(str::to_string).collect(),
        notes: notes.into(),
        environment: environment.into(),
        agent_access_tags: agent_access_tags.into_iter().map(str::to_string).collect(),
        status,
        created_at: created_at.into(),
        updated_at: updated_at.into(),
        rotated_at: rotated_at.map(str::to_string),
        last_tested_at: last_tested_at.map(str::to_string),
        last_used_at: last_used_at.map(str::to_string),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::write_demo_vault;

    #[test]
    fn demo_vault_is_encrypted_at_rest() {
        let temp_dir = tempdir().unwrap();
        let vault_path = temp_dir.path().join("codexvault-demo.cvault");

        let written_path = write_demo_vault(&vault_path, "codexvault-demo").unwrap();
        let content = fs::read_to_string(written_path).unwrap();

        assert!(content.contains("\"format\": \"codexvault\""));
        assert!(!content.contains("demo-openai-primary-2026"));
    }
}
