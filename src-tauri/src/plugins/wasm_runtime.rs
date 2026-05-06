use std::collections::BTreeMap;

use serde_json::{json, Value};
use wasmtime::{Engine, Instance, Linker, Module, Store, TypedFunc};

use crate::plugins::{PluginError, PluginManifest, PluginPermissions};

#[derive(Debug, Clone, Default)]
pub struct PluginContext {
    pub plugin_id: String,
    pub permissions: PluginPermissions,
    pub config: BTreeMap<String, Value>,
    pub emitted_events: Vec<String>,
    pub logs: Vec<String>,
}

#[derive(Debug)]
pub struct WasmInstance {
    store: Store<PluginContext>,
    instance: Instance,
}

impl WasmInstance {
    pub fn create(
        engine: &Engine,
        wasm_bytes: &[u8],
        manifest: &PluginManifest,
    ) -> Result<Self, PluginError> {
        let module = Module::new(engine, wasm_bytes).map_err(PluginError::WasmModule)?;
        let mut linker = Linker::new(engine);

        linker
            .func_wrap("openmail", "log", |mut caller: wasmtime::Caller<'_, PluginContext>| {
                caller
                    .data_mut()
                    .logs
                    .push("plugin invoked openmail.log".to_string());
            })
            .map_err(PluginError::WasmLinker)?;
        linker
            .func_wrap(
                "openmail",
                "emit_event",
                |mut caller: wasmtime::Caller<'_, PluginContext>| {
                    caller
                        .data_mut()
                        .emitted_events
                        .push("plugin emitted event".to_string());
                },
            )
            .map_err(PluginError::WasmLinker)?;
        linker
            .func_wrap(
                "openmail",
                "get_config_len",
                |caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                    caller.data().config.len() as i32
                },
            )
            .map_err(PluginError::WasmLinker)?;

        let mut store = Store::new(
            engine,
            PluginContext {
                plugin_id: manifest.plugin.id.clone(),
                permissions: manifest.permissions.clone(),
                config: BTreeMap::new(),
                emitted_events: Vec::new(),
                logs: Vec::new(),
            },
        );
        let instance = linker
            .instantiate(&mut store, &module)
            .map_err(PluginError::WasmInstantiation)?;

        Ok(Self { store, instance })
    }

    pub fn call_init(&mut self) -> Result<(), PluginError> {
        self.call_optional("init").map(|_| ())
    }

    pub fn call_hook(&mut self, hook: &str, _data: &Value) -> Result<Value, PluginError> {
        let export = format!("hook_{}", sanitize_export_name(hook));
        self.call_required(&export)
    }

    pub fn call_command(&mut self, command: &str, _args: &Value) -> Result<Value, PluginError> {
        let export = format!("command_{}", sanitize_export_name(command));
        self.call_required(&export)
    }

    fn call_optional(&mut self, export: &str) -> Result<Option<Value>, PluginError> {
        let function = match self
            .instance
            .get_typed_func::<(), i32>(&mut self.store, export)
        {
            Ok(function) => function,
            Err(_) => return Ok(None),
        };

        Ok(Some(call_i32_function(
            &mut self.store,
            export,
            function,
        )?))
    }

    fn call_required(&mut self, export: &str) -> Result<Value, PluginError> {
        let function = self
            .instance
            .get_typed_func::<(), i32>(&mut self.store, export)
            .map_err(|_| PluginError::MissingWasmExport(export.to_string()))?;

        call_i32_function(&mut self.store, export, function)
    }
}

fn call_i32_function(
    store: &mut Store<PluginContext>,
    export: &str,
    function: TypedFunc<(), i32>,
) -> Result<Value, PluginError> {
    function
        .call(store, ())
        .map(|code| json!(code))
        .map_err(|source| PluginError::WasmExecution {
            export: export.to_string(),
            source,
        })
}

fn sanitize_export_name(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' => character.to_ascii_lowercase(),
            _ => '_',
        })
        .collect()
}
