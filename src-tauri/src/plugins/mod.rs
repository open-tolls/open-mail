pub mod host;
pub mod manifest;
pub mod wasm_runtime;

pub use host::{
    HookResult, LoadedPlugin, PermissionChecker, PermissionPolicy, PluginError, PluginHost,
    PluginState,
};
pub use manifest::{
    BackendCommandManifest, BackendConfig, FrontendConfig, FrontendSlotManifest, ManifestError,
    PluginConfigField, PluginConfigSchema, PluginManifest, PluginMeta, PluginPermissions,
    ValidationError,
};
pub use wasm_runtime::{PluginContext, WasmInstance};

pub fn subsystem_name() -> &'static str {
    "plugins"
}
