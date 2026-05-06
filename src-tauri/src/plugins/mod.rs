pub mod host;
pub mod manifest;

pub use host::{
    LoadedPlugin, PermissionChecker, PermissionPolicy, PluginError, PluginHost, PluginState,
};
pub use manifest::{
    BackendCommandManifest, BackendConfig, FrontendConfig, FrontendSlotManifest, ManifestError,
    PluginConfigField, PluginConfigSchema, PluginManifest, PluginMeta, PluginPermissions,
    ValidationError,
};

pub fn subsystem_name() -> &'static str {
    "plugins"
}
