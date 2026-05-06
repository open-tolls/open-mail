use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use thiserror::Error;

use crate::plugins::{ManifestError, PluginManifest, PluginPermissions};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Installed,
    Active,
    Disabled,
    Error(String),
}

#[derive(Debug, Clone)]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub root_dir: PathBuf,
    pub manifest_path: PathBuf,
    pub state: PluginState,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PermissionPolicy {
    pub allow_database: bool,
    pub allow_network: bool,
    pub allow_filesystem: bool,
    pub allow_notifications: bool,
    pub allowed_commands: Option<Vec<String>>,
}

impl PermissionPolicy {
    pub fn allow_all() -> Self {
        Self {
            allow_database: true,
            allow_network: true,
            allow_filesystem: true,
            allow_notifications: true,
            allowed_commands: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PermissionChecker {
    policy: PermissionPolicy,
}

impl PermissionChecker {
    pub fn new(policy: PermissionPolicy) -> Self {
        Self { policy }
    }

    pub fn check(&self, permissions: &PluginPermissions) -> Result<(), PluginError> {
        if permissions.database.is_some() && !self.policy.allow_database {
            return Err(PluginError::PermissionDenied(
                "database access is not allowed by host policy".to_string(),
            ));
        }

        if permissions.network && !self.policy.allow_network {
            return Err(PluginError::PermissionDenied(
                "network access is not allowed by host policy".to_string(),
            ));
        }

        if permissions.filesystem && !self.policy.allow_filesystem {
            return Err(PluginError::PermissionDenied(
                "filesystem access is not allowed by host policy".to_string(),
            ));
        }

        if permissions.notifications && !self.policy.allow_notifications {
            return Err(PluginError::PermissionDenied(
                "notifications are not allowed by host policy".to_string(),
            ));
        }

        if let Some(allowed_commands) = &self.policy.allowed_commands {
            for command in &permissions.commands {
                if !allowed_commands.iter().any(|allowed| allowed == command) {
                    return Err(PluginError::PermissionDenied(format!(
                        "command permission `{command}` is not allowed by host policy"
                    )));
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("plugin not found: {0}")]
    NotFound(String),
    #[error("plugin id `{plugin_id}` is already loaded from {existing_path}")]
    DuplicatePluginId {
        plugin_id: String,
        existing_path: PathBuf,
    },
    #[error("failed to read plugin directory {path}: {source}")]
    ReadDirectory {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error(transparent)]
    Manifest(#[from] ManifestError),
    #[error("plugin permission denied: {0}")]
    PermissionDenied(String),
    #[error("plugin backend entry not found: {0}")]
    BackendEntryMissing(PathBuf),
}

#[derive(Debug)]
pub struct PluginHost {
    plugins: HashMap<String, LoadedPlugin>,
    permission_checker: PermissionChecker,
}

impl PluginHost {
    pub fn new(permission_checker: PermissionChecker) -> Self {
        Self {
            plugins: HashMap::new(),
            permission_checker,
        }
    }

    pub fn discover_plugins(&mut self, dirs: &[PathBuf]) -> Result<Vec<PluginManifest>, PluginError> {
        let mut discovered = Vec::new();

        for dir in dirs {
            for manifest_path in collect_manifest_paths(dir)? {
                let manifest = PluginManifest::from_file(&manifest_path)?;
                let plugin_id = manifest.plugin.id.clone();

                if let Some(existing) = self.plugins.get(&plugin_id) {
                    return Err(PluginError::DuplicatePluginId {
                        plugin_id,
                        existing_path: existing.manifest_path.clone(),
                    });
                }

                let root_dir = manifest_path
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| dir.clone());

                self.plugins.insert(
                    manifest.plugin.id.clone(),
                    LoadedPlugin {
                        manifest: manifest.clone(),
                        root_dir,
                        manifest_path: manifest_path.clone(),
                        state: PluginState::Installed,
                    },
                );
                discovered.push(manifest);
            }
        }

        Ok(discovered)
    }

    pub fn activate(&mut self, plugin_id: &str) -> Result<(), PluginError> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))?;

        if plugin.state == PluginState::Active {
            return Ok(());
        }

        if let Err(error) = self.permission_checker.check(&plugin.manifest.permissions) {
            plugin.state = PluginState::Error(error.to_string());
            return Err(error);
        }

        if let Some(backend) = &plugin.manifest.backend {
            let backend_path = plugin.root_dir.join(&backend.entry);
            if !backend_path.exists() {
                let error = PluginError::BackendEntryMissing(backend_path);
                plugin.state = PluginState::Error(error.to_string());
                return Err(error);
            }
        }

        plugin.state = PluginState::Active;
        Ok(())
    }

    pub fn deactivate(&mut self, plugin_id: &str) -> Result<(), PluginError> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))?;
        plugin.state = PluginState::Disabled;
        Ok(())
    }

    pub fn plugins(&self) -> Vec<&LoadedPlugin> {
        let mut plugins = self.plugins.values().collect::<Vec<_>>();
        plugins.sort_by(|left, right| left.manifest.plugin.id.cmp(&right.manifest.plugin.id));
        plugins
    }

    pub fn get(&self, plugin_id: &str) -> Option<&LoadedPlugin> {
        self.plugins.get(plugin_id)
    }
}

fn collect_manifest_paths(dir: &Path) -> Result<Vec<PathBuf>, PluginError> {
    let mut manifests = Vec::new();
    let direct_manifest = dir.join("plugin.toml");

    if direct_manifest.is_file() {
        manifests.push(direct_manifest);
        return Ok(manifests);
    }

    let entries = fs::read_dir(dir).map_err(|source| PluginError::ReadDirectory {
        path: dir.to_path_buf(),
        source,
    })?;

    for entry in entries {
        let entry = entry.map_err(|source| PluginError::ReadDirectory {
            path: dir.to_path_buf(),
            source,
        })?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("plugin.toml");
        if manifest_path.is_file() {
            manifests.push(manifest_path);
        }
    }

    manifests.sort();
    Ok(manifests)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_FRONTEND_PLUGIN: &str = r#"
[plugin]
id = "com.openmail.plugin.quick-actions"
name = "Quick Actions"
version = "1.0.0"
description = "Adds thread actions"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[frontend]
entry = "ui/index.js"
"#;

    const BACKEND_PLUGIN: &str = r#"
[plugin]
id = "com.openmail.plugin.send-later"
name = "Send Later"
version = "1.0.0"
description = "Schedule emails"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[permissions]
database = ["read:messages"]
notifications = true

[backend]
entry = "backend/plugin.wasm"
"#;

    #[test]
    fn discovers_plugins_from_root_and_child_directories() {
        let root = make_temp_plugin_dir("discover_plugins");
        let direct_dir = root.join("direct-plugin");
        let nested_dir = root.join("nested-plugin");

        fs::create_dir_all(&direct_dir).expect("direct dir should exist");
        fs::create_dir_all(&nested_dir).expect("nested dir should exist");
        fs::write(direct_dir.join("plugin.toml"), SIMPLE_FRONTEND_PLUGIN)
            .expect("direct plugin manifest should be written");
        fs::write(nested_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("nested plugin manifest should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        let manifests = host
            .discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");

        assert_eq!(manifests.len(), 2);
        assert_eq!(host.plugins().len(), 2);
        assert!(host.get("com.openmail.plugin.quick-actions").is_some());
        assert!(host.get("com.openmail.plugin.send-later").is_some());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn activates_and_deactivates_loaded_plugins() {
        let root = make_temp_plugin_dir("activate_plugin");
        let plugin_dir = root.join("send-later");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), b"placeholder")
            .expect("backend wasm placeholder should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");

        host.activate("com.openmail.plugin.send-later")
            .expect("plugin should activate");
        assert_eq!(
            host.get("com.openmail.plugin.send-later")
                .expect("plugin should exist")
                .state,
            PluginState::Active
        );

        host.deactivate("com.openmail.plugin.send-later")
            .expect("plugin should deactivate");
        assert_eq!(
            host.get("com.openmail.plugin.send-later")
                .expect("plugin should exist")
                .state,
            PluginState::Disabled
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_activation_when_permission_policy_denies_requested_access() {
        let root = make_temp_plugin_dir("deny_permissions");
        let plugin_dir = root.join("send-later");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), b"placeholder")
            .expect("backend wasm placeholder should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy {
            allow_database: false,
            allow_network: true,
            allow_filesystem: true,
            allow_notifications: true,
            allowed_commands: None,
        }));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");

        let error = host
            .activate("com.openmail.plugin.send-later")
            .expect_err("activation should fail");
        assert!(matches!(error, PluginError::PermissionDenied(_)));
        assert!(matches!(
            &host.get("com.openmail.plugin.send-later")
                .expect("plugin should exist")
                .state,
            PluginState::Error(_)
        ));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_duplicate_plugin_ids_during_discovery() {
        let root = make_temp_plugin_dir("duplicate_plugin_ids");
        let first_dir = root.join("first");
        let second_dir = root.join("second");

        fs::create_dir_all(&first_dir).expect("first dir should exist");
        fs::create_dir_all(&second_dir).expect("second dir should exist");
        fs::write(first_dir.join("plugin.toml"), SIMPLE_FRONTEND_PLUGIN)
            .expect("first plugin manifest should be written");
        fs::write(second_dir.join("plugin.toml"), SIMPLE_FRONTEND_PLUGIN)
            .expect("second plugin manifest should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        let error = host
            .discover_plugins(&[root.clone()])
            .expect_err("duplicate ids should fail discovery");

        assert!(matches!(error, PluginError::DuplicatePluginId { .. }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_activation_when_backend_entry_is_missing() {
        let root = make_temp_plugin_dir("missing_backend");
        let plugin_dir = root.join("send-later");

        fs::create_dir_all(&plugin_dir).expect("plugin dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("plugin manifest should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");

        let error = host
            .activate("com.openmail.plugin.send-later")
            .expect_err("activation should fail");
        assert!(matches!(error, PluginError::BackendEntryMissing(_)));

        let _ = fs::remove_dir_all(root);
    }

    fn make_temp_plugin_dir(prefix: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "open_mail_{prefix}_{}_{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("temp plugin root should exist");
        root
    }
}
