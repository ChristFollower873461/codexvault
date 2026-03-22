use std::{cmp::Ordering, collections::BTreeMap};

use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    models::{now_timestamp, EntryStatus, VaultEntry, VaultPayload},
};

pub fn render_export(payload: &VaultPayload, ids: &[String], format: &str) -> AppResult<String> {
    let export_format = ExportFormat::parse(format)?;
    let entries = select_entries(payload, ids)?;

    match export_format {
        ExportFormat::Env => render_env(&entries),
        ExportFormat::GenericJson => render_generic_json(&entries),
        ExportFormat::OpenClaw => render_openclaw(&entries),
        ExportFormat::OpenClawBundle => render_openclaw_bundle(&entries),
        ExportFormat::ProviderSnippet => render_provider_snippets(&entries),
    }
}

fn select_entries<'a>(payload: &'a VaultPayload, ids: &[String]) -> AppResult<Vec<&'a VaultEntry>> {
    if ids.is_empty() {
        return Ok(payload.entries.iter().collect());
    }

    let mut selected = Vec::new();
    for id in ids {
        let entry = payload
            .entries
            .iter()
            .find(|entry| entry.id == *id)
            .ok_or(AppError::EntryNotFound)?;
        selected.push(entry);
    }
    Ok(selected)
}

fn render_env(entries: &[&VaultEntry]) -> AppResult<String> {
    Ok(entries
        .iter()
        .map(|entry| {
            Ok(format!(
                "{}={}",
                entry.env_var_name,
                serde_json::to_string(&entry.secret_value)?
            ))
        })
        .collect::<Result<Vec<_>, serde_json::Error>>()?
        .join("\n"))
}

fn render_openclaw(entries: &[&VaultEntry]) -> AppResult<String> {
    let selection = build_openclaw_selection(entries);
    let mut lines = vec![
    "# CodexVault OpenClaw env export".to_string(),
    format!("# generatedAt={}", now_timestamp()),
    "# selectionPolicy: one key per OpenClaw env var; prefer active, then old; revoked excluded."
      .to_string(),
  ];

    if selection.selected.is_empty() {
        lines.push("# no exportable entries matched the current selection".to_string());
        return Ok(lines.join("\n"));
    }

    for selected in &selection.selected {
        if selected.used_old_fallback {
            lines.push(format!(
                "# NOTE {} uses an old credential because no active entry matched this provider",
                selected.env_name
            ));
        }
        lines.push(format!(
            "{}={}",
            selected.env_name,
            serde_json::to_string(&selected.entry.secret_value)?
        ));
    }

    if !selection.skipped.is_empty() {
        lines.push(String::new());
        lines.push("# skippedEntries:".to_string());
        for skipped in &selection.skipped {
            lines.push(format!(
                "# - {} :: {} [{}] ({})",
                skipped.env_name,
                skipped.entry.name,
                skipped.entry.provider,
                skipped.reason.label()
            ));
        }
    }

    Ok(lines.join("\n"))
}

fn render_openclaw_bundle(entries: &[&VaultEntry]) -> AppResult<String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenClawSelectionPolicy {
        status_priority: [&'static str; 3],
        dedupe: &'static str,
        revoked_behavior: &'static str,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenClawProviderBinding<'a> {
        provider: String,
        env_var_name: String,
        entry_id: &'a str,
        entry_name: &'a str,
        status: &'a EntryStatus,
        environment: &'a str,
        model_family: &'a Option<String>,
        models: &'a Vec<String>,
        tags: &'a Vec<String>,
        agent_access_tags: &'a Vec<String>,
        used_old_fallback: bool,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenClawSkippedEntry<'a> {
        env_var_name: String,
        reason: &'static str,
        entry_id: &'a str,
        entry_name: &'a str,
        provider: &'a str,
        status: &'a EntryStatus,
        environment: &'a str,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenClawBundle<'a> {
        format: &'static str,
        version: u8,
        generated_at: String,
        selection_policy: OpenClawSelectionPolicy,
        env: BTreeMap<String, String>,
        providers: Vec<OpenClawProviderBinding<'a>>,
        skipped: Vec<OpenClawSkippedEntry<'a>>,
    }

    let selection = build_openclaw_selection(entries);

    let mut env = BTreeMap::new();
    let mut providers = Vec::new();
    for selected in &selection.selected {
        env.insert(
            selected.env_name.clone(),
            selected.entry.secret_value.clone(),
        );
        providers.push(OpenClawProviderBinding {
            provider: openclaw_provider_key(selected.entry),
            env_var_name: selected.env_name.clone(),
            entry_id: &selected.entry.id,
            entry_name: &selected.entry.name,
            status: &selected.entry.status,
            environment: &selected.entry.environment,
            model_family: &selected.entry.model_family,
            models: &selected.entry.models,
            tags: &selected.entry.tags,
            agent_access_tags: &selected.entry.agent_access_tags,
            used_old_fallback: selected.used_old_fallback,
        });
    }

    providers.sort_by(|left, right| left.provider.cmp(&right.provider));

    let skipped = selection
        .skipped
        .iter()
        .map(|entry| OpenClawSkippedEntry {
            env_var_name: entry.env_name.clone(),
            reason: entry.reason.label(),
            entry_id: &entry.entry.id,
            entry_name: &entry.entry.name,
            provider: &entry.entry.provider,
            status: &entry.entry.status,
            environment: &entry.entry.environment,
        })
        .collect::<Vec<_>>();

    let bundle = OpenClawBundle {
        format: "codexvault.openclaw.bundle",
        version: 1,
        generated_at: now_timestamp(),
        selection_policy: OpenClawSelectionPolicy {
            status_priority: ["active", "old", "revoked"],
            dedupe: "one entry per OpenClaw env var name",
            revoked_behavior: "excluded from env output",
        },
        env,
        providers,
        skipped,
    };

    serde_json::to_string_pretty(&bundle).map_err(Into::into)
}

fn render_generic_json(entries: &[&VaultEntry]) -> AppResult<String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct GenericJsonEntry<'a> {
        id: &'a str,
        name: &'a str,
        provider: &'a str,
        env_var_name: &'a str,
        secret_value: &'a str,
        model_family: &'a Option<String>,
        models: &'a Vec<String>,
        tags: &'a Vec<String>,
        notes: &'a str,
        environment: &'a str,
        agent_access_tags: &'a Vec<String>,
        status: &'a EntryStatus,
        created_at: &'a str,
        updated_at: &'a str,
        rotated_at: &'a Option<String>,
        last_tested_at: &'a Option<String>,
        last_used_at: &'a Option<String>,
    }

    let payload = entries
        .iter()
        .map(|entry| GenericJsonEntry {
            id: &entry.id,
            name: &entry.name,
            provider: &entry.provider,
            env_var_name: &entry.env_var_name,
            secret_value: &entry.secret_value,
            model_family: &entry.model_family,
            models: &entry.models,
            tags: &entry.tags,
            notes: &entry.notes,
            environment: &entry.environment,
            agent_access_tags: &entry.agent_access_tags,
            status: &entry.status,
            created_at: &entry.created_at,
            updated_at: &entry.updated_at,
            rotated_at: &entry.rotated_at,
            last_tested_at: &entry.last_tested_at,
            last_used_at: &entry.last_used_at,
        })
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&payload).map_err(Into::into)
}

fn render_provider_snippets(entries: &[&VaultEntry]) -> AppResult<String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ProviderSnippet<'a> {
        provider: &'a str,
        env_var_name: &'a str,
        api_key: &'a str,
        environment: &'a str,
        model_family: &'a Option<String>,
        models: &'a Vec<String>,
        status: &'a EntryStatus,
    }

    let payload = entries
        .iter()
        .map(|entry| ProviderSnippet {
            provider: &entry.provider,
            env_var_name: &entry.env_var_name,
            api_key: &entry.secret_value,
            environment: &entry.environment,
            model_family: &entry.model_family,
            models: &entry.models,
            status: &entry.status,
        })
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&payload).map_err(Into::into)
}

fn openclaw_env_name(entry: &VaultEntry) -> String {
    match entry.provider.trim().to_ascii_lowercase().as_str() {
        "openai" => "OPENAI_API_KEY".into(),
        "anthropic" => "ANTHROPIC_API_KEY".into(),
        "azure" | "azure openai" | "azure-openai" => "AZURE_OPENAI_API_KEY".into(),
        "openrouter" => "OPENROUTER_API_KEY".into(),
        "groq" => "GROQ_API_KEY".into(),
        "google" | "gemini" => "GEMINI_API_KEY".into(),
        "xai" => "XAI_API_KEY".into(),
        "mistral" => "MISTRAL_API_KEY".into(),
        "cohere" => "COHERE_API_KEY".into(),
        "deepseek" => "DEEPSEEK_API_KEY".into(),
        "together" => "TOGETHER_API_KEY".into(),
        _ => entry.env_var_name.clone(),
    }
}

fn openclaw_provider_key(entry: &VaultEntry) -> String {
    match entry.provider.trim().to_ascii_lowercase().as_str() {
        "openai" => "openai".into(),
        "anthropic" => "anthropic".into(),
        "azure" | "azure openai" | "azure-openai" => "azure-openai".into(),
        "openrouter" => "openrouter".into(),
        "groq" => "groq".into(),
        "google" | "gemini" => "gemini".into(),
        "xai" => "xai".into(),
        "mistral" => "mistral".into(),
        "cohere" => "cohere".into(),
        "deepseek" => "deepseek".into(),
        "together" => "together".into(),
        _ => entry.provider.trim().to_ascii_lowercase(),
    }
}

#[derive(Clone, Copy)]
enum OpenClawSkipReason {
    Revoked,
    ShadowedByHigherPriorityEntry,
}

impl OpenClawSkipReason {
    fn label(self) -> &'static str {
        match self {
            Self::Revoked => "revoked",
            Self::ShadowedByHigherPriorityEntry => "shadowedByHigherPriorityEntry",
        }
    }
}

struct OpenClawSelected<'a> {
    env_name: String,
    entry: &'a VaultEntry,
    used_old_fallback: bool,
}

struct OpenClawSkipped<'a> {
    env_name: String,
    entry: &'a VaultEntry,
    reason: OpenClawSkipReason,
}

struct OpenClawSelection<'a> {
    selected: Vec<OpenClawSelected<'a>>,
    skipped: Vec<OpenClawSkipped<'a>>,
}

fn build_openclaw_selection<'a>(entries: &[&'a VaultEntry]) -> OpenClawSelection<'a> {
    let mut by_env_name: BTreeMap<String, Vec<&VaultEntry>> = BTreeMap::new();
    for entry in entries {
        by_env_name
            .entry(openclaw_env_name(entry))
            .or_default()
            .push(*entry);
    }

    let mut selected = Vec::new();
    let mut skipped = Vec::new();

    for (env_name, mut candidates) in by_env_name {
        candidates.sort_by(compare_openclaw_candidates);
        let has_active_candidate = candidates
            .iter()
            .any(|entry| matches!(entry.status, EntryStatus::Active));
        let selected_index = candidates
            .iter()
            .position(|entry| !matches!(entry.status, EntryStatus::Revoked));

        if let Some(index) = selected_index {
            let selected_entry = candidates[index];
            selected.push(OpenClawSelected {
                env_name: env_name.clone(),
                entry: selected_entry,
                used_old_fallback: !has_active_candidate
                    && matches!(selected_entry.status, EntryStatus::Old),
            });

            for (candidate_index, candidate) in candidates.into_iter().enumerate() {
                if candidate_index == index {
                    continue;
                }
                skipped.push(OpenClawSkipped {
                    env_name: env_name.clone(),
                    entry: candidate,
                    reason: if matches!(candidate.status, EntryStatus::Revoked) {
                        OpenClawSkipReason::Revoked
                    } else {
                        OpenClawSkipReason::ShadowedByHigherPriorityEntry
                    },
                });
            }
        } else {
            for candidate in candidates {
                skipped.push(OpenClawSkipped {
                    env_name: env_name.clone(),
                    entry: candidate,
                    reason: OpenClawSkipReason::Revoked,
                });
            }
        }
    }

    skipped.sort_by(|left, right| {
        left.env_name
            .cmp(&right.env_name)
            .then_with(|| left.entry.name.cmp(&right.entry.name))
            .then_with(|| left.entry.id.cmp(&right.entry.id))
    });

    OpenClawSelection { selected, skipped }
}

fn compare_openclaw_candidates(left: &&VaultEntry, right: &&VaultEntry) -> Ordering {
    openclaw_status_priority(&right.status)
        .cmp(&openclaw_status_priority(&left.status))
        .then_with(|| openclaw_freshness(right).cmp(openclaw_freshness(left)))
        .then_with(|| right.updated_at.cmp(&left.updated_at))
        .then_with(|| left.name.cmp(&right.name))
        .then_with(|| left.id.cmp(&right.id))
}

fn openclaw_status_priority(status: &EntryStatus) -> u8 {
    match status {
        EntryStatus::Active => 3,
        EntryStatus::Old => 2,
        EntryStatus::Revoked => 1,
    }
}

fn openclaw_freshness(entry: &VaultEntry) -> &str {
    entry
        .last_tested_at
        .as_deref()
        .or(entry.rotated_at.as_deref())
        .unwrap_or(&entry.updated_at)
}

enum ExportFormat {
    Env,
    GenericJson,
    OpenClaw,
    OpenClawBundle,
    ProviderSnippet,
}

impl ExportFormat {
    fn parse(format: &str) -> AppResult<Self> {
        match format {
            "env" => Ok(Self::Env),
            "genericJson" => Ok(Self::GenericJson),
            "openClaw" => Ok(Self::OpenClaw),
            "openClawBundle" => Ok(Self::OpenClawBundle),
            "providerSnippet" => Ok(Self::ProviderSnippet),
            _ => Err(AppError::Validation("Unsupported export format.".into())),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use crate::models::{EntryStatus, VaultEntry, VaultPayload, VaultSettings};

    use super::render_export;

    fn sample_entry(
        id: &str,
        name: &str,
        provider: &str,
        status: EntryStatus,
        secret: &str,
        updated_at: &str,
    ) -> VaultEntry {
        VaultEntry {
            id: id.into(),
            name: name.into(),
            provider: provider.into(),
            env_var_name: format!(
                "{}_API_KEY",
                provider.to_ascii_uppercase().replace(' ', "_")
            ),
            secret_value: secret.into(),
            model_family: Some("gpt-4.1".into()),
            models: vec!["gpt-4.1".into()],
            tags: vec!["prod".into()],
            notes: "Primary".into(),
            environment: "production".into(),
            agent_access_tags: vec!["writer".into()],
            status,
            created_at: "2026-03-01T10:00:00Z".into(),
            updated_at: updated_at.into(),
            rotated_at: None,
            last_tested_at: None,
            last_used_at: None,
        }
    }

    fn sample_payload(entries: Vec<VaultEntry>) -> VaultPayload {
        VaultPayload {
            vault_name: "CodexVault".into(),
            settings: VaultSettings::default(),
            entries,
        }
    }

    #[test]
    fn env_export_uses_env_var_names() {
        let payload = sample_payload(vec![sample_entry(
            "entry-1",
            "OpenAI Primary",
            "OpenAI",
            EntryStatus::Active,
            "sk-secret",
            "2026-03-21T10:00:00Z",
        )]);
        let export = render_export(&payload, &[], "env").unwrap();
        assert!(export.contains("OPENAI_API_KEY"));
    }

    #[test]
    fn openclaw_export_uses_provider_defaults_and_skips_revoked() {
        let payload = sample_payload(vec![
            sample_entry(
                "entry-openai-active",
                "OpenAI Active",
                "OpenAI",
                EntryStatus::Active,
                "sk-openai-active",
                "2026-03-20T10:00:00Z",
            ),
            sample_entry(
                "entry-openai-old",
                "OpenAI Old",
                "OpenAI",
                EntryStatus::Old,
                "sk-openai-old",
                "2026-03-21T10:00:00Z",
            ),
            sample_entry(
                "entry-openai-revoked",
                "OpenAI Revoked",
                "OpenAI",
                EntryStatus::Revoked,
                "sk-openai-revoked",
                "2026-03-21T12:00:00Z",
            ),
            sample_entry(
                "entry-anthropic-old",
                "Anthropic Old",
                "Anthropic",
                EntryStatus::Old,
                "sk-anthropic-old",
                "2026-03-19T10:00:00Z",
            ),
            sample_entry(
                "entry-groq-revoked",
                "Groq Revoked",
                "Groq",
                EntryStatus::Revoked,
                "sk-groq-revoked",
                "2026-03-19T10:00:00Z",
            ),
        ]);

        let export = render_export(&payload, &[], "openClaw").unwrap();

        assert!(export.contains("OPENAI_API_KEY"));
        assert!(export.contains("sk-openai-active"));
        assert!(!export.contains("sk-openai-old"));
        assert!(export.contains("ANTHROPIC_API_KEY"));
        assert!(export.contains("sk-anthropic-old"));
        assert!(!export.contains("GROQ_API_KEY="));
        assert!(export.contains("uses an old credential"));
        assert!(export.contains("skippedEntries"));
        assert!(export.contains("revoked"));
    }

    #[test]
    fn openclaw_bundle_export_is_auditable_and_deterministic() {
        let payload = sample_payload(vec![
            sample_entry(
                "entry-openai-active",
                "OpenAI Active",
                "OpenAI",
                EntryStatus::Active,
                "sk-openai-active",
                "2026-03-20T10:00:00Z",
            ),
            sample_entry(
                "entry-openai-old",
                "OpenAI Old",
                "OpenAI",
                EntryStatus::Old,
                "sk-openai-old",
                "2026-03-21T10:00:00Z",
            ),
            sample_entry(
                "entry-anthropic-old",
                "Anthropic Old",
                "Anthropic",
                EntryStatus::Old,
                "sk-anthropic-old",
                "2026-03-19T10:00:00Z",
            ),
            sample_entry(
                "entry-groq-revoked",
                "Groq Revoked",
                "Groq",
                EntryStatus::Revoked,
                "sk-groq-revoked",
                "2026-03-19T10:00:00Z",
            ),
        ]);

        let export = render_export(&payload, &[], "openClawBundle").unwrap();
        let json: Value = serde_json::from_str(&export).unwrap();

        assert_eq!(
            json.get("format")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "codexvault.openclaw.bundle"
        );
        assert!(json
            .get("env")
            .and_then(|env| env.get("OPENAI_API_KEY"))
            .is_some());
        assert!(json
            .get("env")
            .and_then(|env| env.get("ANTHROPIC_API_KEY"))
            .is_some());
        assert!(json
            .get("env")
            .and_then(|env| env.get("GROQ_API_KEY"))
            .is_none());
        assert!(json
            .get("providers")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty()));
        assert!(json
            .get("skipped")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty()));
    }
}
