pub mod manifest;

pub use manifest::{
    BackendCommandManifest, BackendConfig, FrontendConfig, FrontendSlotManifest, ManifestError,
    PluginConfigField, PluginConfigSchema, PluginManifest, PluginMeta, PluginPermissions,
    ValidationError,
};

pub fn subsystem_name() -> &'static str {
    "plugins"
}
