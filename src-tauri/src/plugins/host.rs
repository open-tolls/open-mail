use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde_json::Value;
use thiserror::Error;
use wasmtime::Engine;

use crate::plugins::{ManifestError, PluginManifest, PluginPermissions, WasmInstance};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Installed,
    Active,
    Disabled,
    Error(String),
}

#[derive(Debug)]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub root_dir: PathBuf,
    pub manifest_path: PathBuf,
    pub state: PluginState,
    pub instance: Option<WasmInstance>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HookResult {
    pub plugin_id: String,
    pub result: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransformHookResult {
    pub plugin_id: String,
    pub result: Value,
    pub transformed_payload: Value,
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
    #[error("plugin backend hook not declared in manifest: {0}")]
    HookNotDeclared(String),
    #[error("plugin backend command not declared in manifest: {0}")]
    CommandNotDeclared(String),
    #[error("plugin wasm export missing: {0}")]
    MissingWasmExport(String),
    #[error("plugin wasm module failed to compile")]
    WasmModule(#[source] wasmtime::Error),
    #[error("plugin wasm linker failed")]
    WasmLinker(#[source] wasmtime::Error),
    #[error("plugin wasm instantiation failed")]
    WasmInstantiation(#[source] wasmtime::Error),
    #[error("plugin wasm execution failed in export `{export}`")]
    WasmExecution {
        export: String,
        #[source]
        source: wasmtime::Error,
    },
}

pub struct PluginHost {
    plugins: HashMap<String, LoadedPlugin>,
    permission_checker: PermissionChecker,
    wasm_engine: Engine,
}

impl PluginHost {
    pub fn new(permission_checker: PermissionChecker) -> Self {
        Self {
            plugins: HashMap::new(),
            permission_checker,
            wasm_engine: Engine::default(),
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
                        instance: None,
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

            let wasm_bytes = fs::read(&backend_path).map_err(|source| PluginError::ReadDirectory {
                path: backend_path.clone(),
                source,
            })?;
            let mut instance = match WasmInstance::create(&self.wasm_engine, &wasm_bytes, &plugin.manifest) {
                Ok(instance) => instance,
                Err(error) => {
                    plugin.state = PluginState::Error(error.to_string());
                    return Err(error);
                }
            };
            if let Err(error) = instance.call_init() {
                plugin.state = PluginState::Error(error.to_string());
                return Err(error);
            }

            plugin.instance = Some(instance);
        }

        plugin.state = PluginState::Active;
        Ok(())
    }

    pub fn deactivate(&mut self, plugin_id: &str) -> Result<(), PluginError> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))?;
        plugin.instance = None;
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

    pub fn dispatch_hook(&mut self, hook: &str, data: &Value) -> Vec<HookResult> {
        let mut results = Vec::new();
        let mut plugin_ids = self.plugins.keys().cloned().collect::<Vec<_>>();
        plugin_ids.sort();

        for plugin_id in plugin_ids {
            let Some(plugin) = self.plugins.get_mut(&plugin_id) else {
                continue;
            };
            if plugin.state != PluginState::Active {
                continue;
            }

            let Some(backend) = &plugin.manifest.backend else {
                continue;
            };

            if !backend.hooks.iter().any(|registered| registered == hook) {
                continue;
            }

            let Some(instance) = plugin.instance.as_mut() else {
                continue;
            };

            match instance.call_hook(hook, data) {
                Ok(execution) => results.push(HookResult {
                    plugin_id: plugin.manifest.plugin.id.clone(),
                    result: execution.result,
                }),
                Err(error) => {
                    plugin.state = PluginState::Error(error.to_string());
                }
            }
        }

        results
    }

    pub fn dispatch_transform_hook(
        &mut self,
        hook: &str,
        data: &Value,
    ) -> (Value, Vec<TransformHookResult>) {
        let mut current_payload = data.clone();
        let mut results = Vec::new();
        let mut plugin_ids = self.plugins.keys().cloned().collect::<Vec<_>>();
        plugin_ids.sort();

        for plugin_id in plugin_ids {
            let Some(plugin) = self.plugins.get_mut(&plugin_id) else {
                continue;
            };
            if plugin.state != PluginState::Active {
                continue;
            }

            let Some(backend) = &plugin.manifest.backend else {
                continue;
            };

            if !backend.hooks.iter().any(|registered| registered == hook) {
                continue;
            }

            let Some(instance) = plugin.instance.as_mut() else {
                continue;
            };

            match instance.call_hook(hook, &current_payload) {
                Ok(execution) => {
                    if let Some(transformed_payload) = execution.transformed_payload {
                        merge_json_value(&mut current_payload, &transformed_payload);
                        results.push(TransformHookResult {
                            plugin_id: plugin.manifest.plugin.id.clone(),
                            result: execution.result,
                            transformed_payload: current_payload.clone(),
                        });
                    }
                }
                Err(error) => {
                    plugin.state = PluginState::Error(error.to_string());
                }
            }
        }

        (current_payload, results)
    }

    pub fn execute_command(
        &mut self,
        plugin_id: &str,
        command: &str,
        args: &Value,
    ) -> Result<Value, PluginError> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))?;

        let backend = plugin
            .manifest
            .backend
            .as_ref()
            .ok_or_else(|| PluginError::CommandNotDeclared(command.to_string()))?;

        if !backend.commands.iter().any(|registered| registered.name == command) {
            return Err(PluginError::CommandNotDeclared(command.to_string()));
        }

        let Some(instance) = plugin.instance.as_mut() else {
            return Err(PluginError::CommandNotDeclared(command.to_string()));
        };

        match instance.call_command(command, args) {
            Ok(result) => Ok(result),
            Err(error) => {
                plugin.state = PluginState::Error(error.to_string());
                Err(error)
            }
        }
    }
}

fn merge_json_value(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(target_map), Value::Object(patch_map)) => {
            for (key, patch_value) in patch_map {
                match target_map.get_mut(key) {
                    Some(target_value) => merge_json_value(target_value, patch_value),
                    None => {
                        target_map.insert(key.clone(), patch_value.clone());
                    }
                }
            }
        }
        (target_value, patch_value) => {
            *target_value = patch_value.clone();
        }
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
hooks = ["on_message_received"]
commands = [{ name = "schedule_send", handler = "handle_schedule_send" }]
"#;

    const IMPORT_PLUGIN_WITH_PERMISSIONS: &str = r#"
[plugin]
id = "com.openmail.plugin.host-apis"
name = "Host APIs"
version = "1.0.0"
description = "Uses host APIs"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[permissions]
database = ["read:messages", "write:scheduled_sends"]
network = true
filesystem = true
notifications = true

[backend]
entry = "backend/plugin.wasm"
commands = [{ name = "probe_host", handler = "handle_probe_host" }]
"#;

    const IMPORT_PLUGIN_WITHOUT_PERMISSIONS: &str = r#"
[plugin]
id = "com.openmail.plugin.host-apis-denied"
name = "Host APIs Denied"
version = "1.0.0"
description = "Uses host APIs without declaring permissions"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[backend]
entry = "backend/plugin.wasm"
commands = [{ name = "probe_host", handler = "handle_probe_host" }]
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
        fs::write(backend_dir.join("plugin.wasm"), backend_plugin_wasm())
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
        assert!(
            host.get("com.openmail.plugin.send-later")
                .and_then(|plugin| plugin.instance.as_ref())
                .is_some()
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
        fs::write(backend_dir.join("plugin.wasm"), backend_plugin_wasm())
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

    #[test]
    fn dispatches_hooks_and_executes_wasm_commands() {
        let root = make_temp_plugin_dir("dispatch_hooks");
        let plugin_dir = root.join("send-later");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), backend_plugin_wasm())
            .expect("backend wasm placeholder should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");
        host.activate("com.openmail.plugin.send-later")
            .expect("plugin should activate");

        let hook_results = host.dispatch_hook("on_message_received", &Value::Null);
        assert_eq!(hook_results.len(), 1);
        assert_eq!(hook_results[0].result, Value::from(7));

        let command_result = host
            .execute_command(
                "com.openmail.plugin.send-later",
                "schedule_send",
                &Value::Null,
            )
            .expect("command should execute");
        assert_eq!(command_result, Value::from(42));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn dispatches_transform_hooks_sequentially() {
        let root = make_temp_plugin_dir("dispatch_transform_hooks");
        let first_dir = root.join("plugin-a");
        let second_dir = root.join("plugin-b");

        fs::create_dir_all(first_dir.join("backend")).expect("first backend dir should exist");
        fs::create_dir_all(second_dir.join("backend")).expect("second backend dir should exist");
        fs::write(
            first_dir.join("plugin.toml"),
            BACKEND_PLUGIN.replace(
                "com.openmail.plugin.send-later",
                "com.openmail.plugin.transform-a",
            )
            .replace("hooks = [\"on_message_received\"]", "hooks = [\"on_message_sending\"]"),
        )
        .expect("first plugin manifest should be written");
        fs::write(
            second_dir.join("plugin.toml"),
            BACKEND_PLUGIN.replace(
                "com.openmail.plugin.send-later",
                "com.openmail.plugin.transform-b",
            )
            .replace("hooks = [\"on_message_received\"]", "hooks = [\"on_message_sending\"]"),
        )
        .expect("second plugin manifest should be written");
        fs::write(first_dir.join("backend/plugin.wasm"), transform_subject_plugin_wasm("Alpha"))
            .expect("first wasm should be written");
        fs::write(second_dir.join("backend/plugin.wasm"), transform_subject_plugin_wasm("Beta"))
            .expect("second wasm should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");
        host.activate("com.openmail.plugin.transform-a")
            .expect("first plugin should activate");
        host.activate("com.openmail.plugin.transform-b")
            .expect("second plugin should activate");

        let payload = serde_json::json!({
            "mimeMessage": {
                "subject": "Original"
            }
        });
        let (transformed_payload, results) =
            host.dispatch_transform_hook("on_message_sending", &payload);

        assert_eq!(
            transformed_payload,
            serde_json::json!({
                "mimeMessage": {
                    "subject": "Beta"
                }
            })
        );
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].plugin_id, "com.openmail.plugin.transform-a");
        assert_eq!(results[1].plugin_id, "com.openmail.plugin.transform-b");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn isolates_plugin_errors_without_panicking_host() {
        let root = make_temp_plugin_dir("plugin_error_isolation");
        let plugin_dir = root.join("send-later");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), BACKEND_PLUGIN)
            .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), failing_backend_plugin_wasm())
            .expect("backend wasm placeholder should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");
        host.activate("com.openmail.plugin.send-later")
            .expect("plugin should activate");

        let error = host
            .execute_command(
                "com.openmail.plugin.send-later",
                "schedule_send",
                &Value::Null,
            )
            .expect_err("command should fail");
        assert!(matches!(error, PluginError::WasmExecution { .. }));
        assert!(matches!(
            &host.get("com.openmail.plugin.send-later")
                .expect("plugin should exist")
                .state,
            PluginState::Error(_)
        ));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn exposes_permissioned_host_apis_to_wasm_plugins() {
        let root = make_temp_plugin_dir("host_api_permissions");
        let plugin_dir = root.join("host-apis");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(plugin_dir.join("plugin.toml"), IMPORT_PLUGIN_WITH_PERMISSIONS)
            .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), host_api_plugin_wasm())
            .expect("backend wasm should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");
        host.activate("com.openmail.plugin.host-apis")
            .expect("plugin should activate");

        let result = host
            .execute_command(
                "com.openmail.plugin.host-apis",
                "probe_host",
                &Value::Null,
            )
            .expect("command should execute");
        assert_eq!(result, Value::from(1508));

        let instance = host
            .get("com.openmail.plugin.host-apis")
            .and_then(|plugin| plugin.instance.as_ref())
            .expect("instance should exist");
        assert_eq!(
            instance.host_calls(),
            &[
                "db_query".to_string(),
                "db_execute".to_string(),
                "send_notification".to_string(),
                "http_request".to_string(),
                "read_file".to_string(),
                "write_file".to_string(),
            ]
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_wasm_imports_that_are_not_declared_in_manifest_permissions() {
        let root = make_temp_plugin_dir("host_api_permission_denied");
        let plugin_dir = root.join("host-apis-denied");
        let backend_dir = plugin_dir.join("backend");

        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        fs::write(
            plugin_dir.join("plugin.toml"),
            IMPORT_PLUGIN_WITHOUT_PERMISSIONS,
        )
        .expect("plugin manifest should be written");
        fs::write(backend_dir.join("plugin.wasm"), host_api_plugin_wasm())
            .expect("backend wasm should be written");

        let mut host = PluginHost::new(PermissionChecker::new(PermissionPolicy::allow_all()));
        host.discover_plugins(&[root.clone()])
            .expect("plugin discovery should succeed");

        let error = host
            .activate("com.openmail.plugin.host-apis-denied")
            .expect_err("activation should fail");
        assert!(matches!(error, PluginError::PermissionDenied(_)));
        assert!(matches!(
            &host.get("com.openmail.plugin.host-apis-denied")
                .expect("plugin should exist")
                .state,
            PluginState::Error(_)
        ));

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

    fn backend_plugin_wasm() -> Vec<u8> {
        wat::parse_str(
            r#"
            (module
              (func (export "init") (result i32)
                i32.const 0)
              (func (export "hook_on_message_received") (result i32)
                i32.const 7)
              (func (export "command_schedule_send") (result i32)
                i32.const 42)
            )
            "#,
        )
        .expect("wat should compile")
    }

    fn failing_backend_plugin_wasm() -> Vec<u8> {
        wat::parse_str(
            r#"
            (module
              (func (export "init") (result i32)
                i32.const 0)
              (func (export "hook_on_message_received") (result i32)
                i32.const 1)
              (func (export "command_schedule_send") (result i32)
                unreachable
              )
            )
            "#,
        )
        .expect("wat should compile")
    }

    fn host_api_plugin_wasm() -> Vec<u8> {
        wat::parse_str(
            r#"
            (module
              (import "openmail" "db_query" (func $db_query (result i32)))
              (import "openmail" "db_execute" (func $db_execute (result i32)))
              (import "openmail" "send_notification" (func $send_notification (result i32)))
              (import "openmail" "http_request" (func $http_request (result i32)))
              (import "openmail" "read_file" (func $read_file (result i32)))
              (import "openmail" "write_file" (func $write_file (result i32)))
              (func (export "init") (result i32)
                i32.const 0)
              (func (export "command_probe_host") (result i32)
                call $db_query
                call $db_execute
                i32.add
                call $send_notification
                i32.add
                call $http_request
                i32.add
                call $read_file
                i32.add
                call $write_file
                i32.add)
            )
            "#,
        )
        .expect("wat should compile")
    }

    fn transform_subject_plugin_wasm(subject: &str) -> Vec<u8> {
        let subject_json = format!(r#"{{"mimeMessage":{{"subject":"{subject}"}}}}"#);
        let escaped = subject_json.replace('\\', "\\\\").replace('"', "\\\"");
        let length = subject_json.len();
        let wat = format!(
            r#"
            (module
              (import "openmail" "set_payload_json" (func $set_payload_json (param i32 i32) (result i32)))
              (memory (export "memory") 1)
              (data (i32.const 0) "{escaped}")
              (func (export "init") (result i32)
                i32.const 0)
              (func (export "hook_on_message_sending") (result i32)
                i32.const 0
                i32.const {length}
                call $set_payload_json
              )
            )
            "#
        );

        wat::parse_str(wat).expect("wat should compile")
    }
}
