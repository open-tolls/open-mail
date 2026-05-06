use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PluginManifest {
    pub plugin: PluginMeta,
    #[serde(default)]
    pub permissions: PluginPermissions,
    pub frontend: Option<FrontendConfig>,
    pub backend: Option<BackendConfig>,
    pub config: Option<PluginConfigSchema>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub min_app_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
pub struct PluginPermissions {
    pub database: Option<Vec<String>>,
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub filesystem: bool,
    #[serde(default)]
    pub notifications: bool,
    #[serde(default)]
    pub commands: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct FrontendConfig {
    pub entry: String,
    #[serde(default)]
    pub slots: Vec<FrontendSlotManifest>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct FrontendSlotManifest {
    pub name: String,
    pub component: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct BackendConfig {
    pub entry: String,
    #[serde(default)]
    pub hooks: Vec<String>,
    #[serde(default)]
    pub commands: Vec<BackendCommandManifest>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct BackendCommandManifest {
    pub name: String,
    pub handler: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PluginConfigSchema {
    #[serde(default)]
    pub fields: BTreeMap<String, PluginConfigField>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PluginConfigField {
    #[serde(rename = "type")]
    pub field_type: String,
    pub label: String,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub default: Option<toml::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("failed to read manifest at {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse manifest at {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: toml::de::Error,
    },
    #[error("manifest validation failed")]
    Validation(Vec<ValidationError>),
}

impl PluginManifest {
    pub fn from_file(path: &Path) -> Result<Self, ManifestError> {
        let raw = fs::read_to_string(path).map_err(|source| ManifestError::Read {
            path: path.to_path_buf(),
            source,
        })?;
        let manifest = toml::from_str::<Self>(&raw).map_err(|source| ManifestError::Parse {
            path: path.to_path_buf(),
            source,
        })?;

        manifest.validate().map_err(ManifestError::Validation)?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();

        validate_required(&mut errors, "plugin.id", &self.plugin.id);
        validate_required(&mut errors, "plugin.name", &self.plugin.name);
        validate_required(&mut errors, "plugin.version", &self.plugin.version);
        validate_required(&mut errors, "plugin.description", &self.plugin.description);
        validate_required(&mut errors, "plugin.author", &self.plugin.author);
        validate_required(&mut errors, "plugin.license", &self.plugin.license);
        validate_required(
            &mut errors,
            "plugin.min_app_version",
            &self.plugin.min_app_version,
        );

        if !looks_like_semver(&self.plugin.version) {
            errors.push(validation_error(
                "plugin.version",
                "must use semver format like 1.0.0",
            ));
        }

        if !looks_like_semver(&self.plugin.min_app_version) {
            errors.push(validation_error(
                "plugin.min_app_version",
                "must use semver format like 1.0.0",
            ));
        }

        if self.frontend.is_none() && self.backend.is_none() {
            errors.push(validation_error(
                "manifest",
                "plugin must declare at least one of [frontend] or [backend]",
            ));
        }

        if let Some(frontend) = &self.frontend {
            validate_required(&mut errors, "frontend.entry", &frontend.entry);

            for (index, slot) in frontend.slots.iter().enumerate() {
                validate_required(
                    &mut errors,
                    &format!("frontend.slots[{index}].name"),
                    &slot.name,
                );
                validate_required(
                    &mut errors,
                    &format!("frontend.slots[{index}].component"),
                    &slot.component,
                );
            }
        }

        if let Some(backend) = &self.backend {
            validate_required(&mut errors, "backend.entry", &backend.entry);

            for (index, hook) in backend.hooks.iter().enumerate() {
                if hook.trim().is_empty() {
                    errors.push(validation_error(
                        &format!("backend.hooks[{index}]"),
                        "hook name cannot be empty",
                    ));
                }
            }

            for (index, command) in backend.commands.iter().enumerate() {
                validate_required(
                    &mut errors,
                    &format!("backend.commands[{index}].name"),
                    &command.name,
                );
                validate_required(
                    &mut errors,
                    &format!("backend.commands[{index}].handler"),
                    &command.handler,
                );
            }
        }

        if let Some(scopes) = &self.permissions.database {
            for (index, scope) in scopes.iter().enumerate() {
                if !scope.contains(':') {
                    errors.push(validation_error(
                        &format!("permissions.database[{index}]"),
                        "database scope must include an action prefix like read:messages",
                    ));
                }
            }
        }

        for (index, command) in self.permissions.commands.iter().enumerate() {
            if command.trim().is_empty() {
                errors.push(validation_error(
                    &format!("permissions.commands[{index}]"),
                    "command permission cannot be empty",
                ));
            }
        }

        if let Some(config) = &self.config {
            for (field_name, field) in &config.fields {
                validate_required(
                    &mut errors,
                    &format!("config.fields.{field_name}.type"),
                    &field.field_type,
                );
                validate_required(
                    &mut errors,
                    &format!("config.fields.{field_name}.label"),
                    &field.label,
                );

                if field.field_type == "select" && field.options.is_empty() {
                    errors.push(validation_error(
                        &format!("config.fields.{field_name}.options"),
                        "select fields must define at least one option",
                    ));
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

fn validate_required(errors: &mut Vec<ValidationError>, field: &str, value: &str) {
    if value.trim().is_empty() {
        errors.push(validation_error(field, "value cannot be empty"));
    }
}

fn validation_error(field: &str, message: &str) -> ValidationError {
    ValidationError {
        field: field.to_string(),
        message: message.to_string(),
    }
}

fn looks_like_semver(value: &str) -> bool {
    let mut parts = value.trim().split('.');

    let Some(major) = parts.next() else {
        return false;
    };
    let Some(minor) = parts.next() else {
        return false;
    };
    let Some(patch) = parts.next() else {
        return false;
    };

    if parts.next().is_some() {
        return false;
    }

    [major, minor, patch]
        .into_iter()
        .all(|part| !part.is_empty() && part.parse::<u64>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_MANIFEST: &str = r#"
[plugin]
id = "com.openmail.plugin.send-later"
name = "Send Later"
version = "1.0.0"
description = "Schedule emails to be sent later"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[permissions]
database = ["read:messages", "write:scheduled_sends"]
network = false
filesystem = false
notifications = true
commands = ["send_draft"]

[frontend]
entry = "ui/index.js"
slots = [
  { name = "composer:send-button-dropdown", component = "SendLaterButton" },
  { name = "preferences:section", component = "SendLaterPreferences" },
]

[backend]
entry = "backend/plugin.wasm"
hooks = ["on_message_received", "on_draft_created"]
commands = [
  { name = "schedule_send", handler = "handle_schedule_send" },
  { name = "cancel_scheduled", handler = "handle_cancel_scheduled" },
]

[config.fields.default_delay]
type = "select"
label = "Default delay"
options = ["1 hour", "Tomorrow morning", "Custom"]
default = "1 hour"

[config.fields.morning_time]
type = "time"
label = "Morning time"
default = "08:00"
"#;

    #[test]
    fn validates_a_full_manifest() {
        let manifest = toml::from_str::<PluginManifest>(VALID_MANIFEST).expect("manifest should parse");

        manifest.validate().expect("manifest should validate");
        assert_eq!(manifest.plugin.id, "com.openmail.plugin.send-later");
        assert!(manifest.permissions.notifications);
        assert_eq!(
            manifest.frontend.as_ref().expect("frontend").slots.len(),
            2
        );
        assert_eq!(
            manifest.backend.as_ref().expect("backend").commands.len(),
            2
        );
    }

    #[test]
    fn supports_manifest_with_frontend_only() {
        let manifest = toml::from_str::<PluginManifest>(
            r#"
[plugin]
id = "com.openmail.plugin.theme-preview"
name = "Theme Preview"
version = "1.1.0"
description = "Preview themes"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[frontend]
entry = "ui/index.js"
"#,
        )
        .expect("manifest should parse");

        manifest.validate().expect("frontend-only manifest should validate");
        assert!(manifest.frontend.is_some());
        assert!(manifest.backend.is_none());
    }

    #[test]
    fn reports_validation_errors_for_invalid_manifest() {
        let manifest = toml::from_str::<PluginManifest>(
            r#"
[plugin]
id = ""
name = "Broken"
version = "1"
description = ""
author = "Open Mail Team"
license = "MIT"
min_app_version = "beta"

[permissions]
database = ["messages"]
commands = [""]

[frontend]
entry = ""
slots = [{ name = "", component = "" }]

[config.fields.default_delay]
type = "select"
label = ""
"#,
        )
        .expect("manifest should parse");

        let errors = manifest.validate().expect_err("manifest should be invalid");
        assert!(errors.iter().any(|error| error.field == "plugin.id"));
        assert!(errors.iter().any(|error| error.field == "plugin.version"));
        assert!(errors
            .iter()
            .any(|error| error.field == "plugin.min_app_version"));
        assert!(errors
            .iter()
            .any(|error| error.field == "permissions.database[0]"));
        assert!(errors
            .iter()
            .any(|error| error.field == "config.fields.default_delay.options"));
    }

    #[test]
    fn loads_manifest_from_file() {
        let path = std::env::temp_dir().join(format!(
            "open_mail_plugin_manifest_{}.toml",
            std::process::id()
        ));
        fs::write(&path, VALID_MANIFEST).expect("manifest file should be written");

        let manifest = PluginManifest::from_file(&path).expect("manifest should load from disk");
        assert_eq!(manifest.plugin.name, "Send Later");

        fs::remove_file(path).expect("manifest file should be removed");
    }
}
