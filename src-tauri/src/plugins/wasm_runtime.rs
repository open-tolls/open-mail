use std::collections::BTreeMap;

use serde_json::{json, Value};
use wasmtime::{Engine, ExternType, Instance, Linker, Module, Store, TypedFunc};

use crate::plugins::{PluginError, PluginManifest, PluginPermissions};

#[derive(Debug, Clone, Default)]
pub struct PluginContext {
    pub plugin_id: String,
    pub permissions: PluginPermissions,
    pub config: BTreeMap<String, Value>,
    pub last_payload: Option<Value>,
    pub transformed_payload: Option<Value>,
    pub emitted_events: Vec<String>,
    pub logs: Vec<String>,
    pub host_calls: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HookExecution {
    pub result: Value,
    pub transformed_payload: Option<Value>,
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
        validate_import_permissions(&module, &manifest.permissions)?;
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
        linker
            .func_wrap(
                "openmail",
                "get_payload_len",
                |caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                    caller
                        .data()
                        .last_payload
                        .as_ref()
                        .map(|payload| payload.to_string().len() as i32)
                        .unwrap_or(0)
                },
            )
            .map_err(PluginError::WasmLinker)?;
        linker
            .func_wrap(
                "openmail",
                "set_payload_json",
                |mut caller: wasmtime::Caller<'_, PluginContext>, ptr: i32, len: i32| -> i32 {
                    match read_memory_string(&mut caller, ptr, len)
                        .and_then(|json| serde_json::from_str::<Value>(&json).ok())
                    {
                        Some(value) => {
                            caller.data_mut().transformed_payload = Some(value);
                            1
                        }
                        None => 0,
                    }
                },
            )
            .map_err(PluginError::WasmLinker)?;
        if allows_database_read(&manifest.permissions) {
            linker
                .func_wrap(
                    "openmail",
                    "db_query",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller.data_mut().host_calls.push("db_query".to_string());
                        101
                    },
                )
                .map_err(PluginError::WasmLinker)?;
        }
        if allows_database_write(&manifest.permissions) {
            linker
                .func_wrap(
                    "openmail",
                    "db_execute",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller.data_mut().host_calls.push("db_execute".to_string());
                        102
                    },
                )
                .map_err(PluginError::WasmLinker)?;
        }
        if manifest.permissions.notifications {
            linker
                .func_wrap(
                    "openmail",
                    "send_notification",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller
                            .data_mut()
                            .host_calls
                            .push("send_notification".to_string());
                        201
                    },
                )
                .map_err(PluginError::WasmLinker)?;
        }
        if manifest.permissions.network {
            linker
                .func_wrap(
                    "openmail",
                    "http_request",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller.data_mut().host_calls.push("http_request".to_string());
                        301
                    },
                )
                .map_err(PluginError::WasmLinker)?;
        }
        if manifest.permissions.filesystem {
            linker
                .func_wrap(
                    "openmail",
                    "read_file",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller.data_mut().host_calls.push("read_file".to_string());
                        401
                    },
                )
                .map_err(PluginError::WasmLinker)?;
            linker
                .func_wrap(
                    "openmail",
                    "write_file",
                    |mut caller: wasmtime::Caller<'_, PluginContext>| -> i32 {
                        caller.data_mut().host_calls.push("write_file".to_string());
                        402
                    },
                )
                .map_err(PluginError::WasmLinker)?;
        }

        let mut store = Store::new(
            engine,
            PluginContext {
                plugin_id: manifest.plugin.id.clone(),
                permissions: manifest.permissions.clone(),
                config: BTreeMap::new(),
                last_payload: None,
                transformed_payload: None,
                emitted_events: Vec::new(),
                logs: Vec::new(),
                host_calls: Vec::new(),
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

    pub fn call_hook(&mut self, hook: &str, data: &Value) -> Result<HookExecution, PluginError> {
        self.store.data_mut().last_payload = Some(data.clone());
        self.store.data_mut().transformed_payload = None;
        let export = format!("hook_{}", sanitize_export_name(hook));
        let result = self.call_required(&export)?;
        let transformed_payload = self.store.data().transformed_payload.clone();

        Ok(HookExecution {
            result,
            transformed_payload,
        })
    }

    pub fn call_command(&mut self, command: &str, args: &Value) -> Result<Value, PluginError> {
        self.store.data_mut().last_payload = Some(args.clone());
        let export = format!("command_{}", sanitize_export_name(command));
        self.call_required(&export)
    }

    pub fn host_calls(&self) -> &[String] {
        &self.store.data().host_calls
    }

    pub fn emitted_events(&self) -> &[String] {
        &self.store.data().emitted_events
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

fn read_memory_string(
    caller: &mut wasmtime::Caller<'_, PluginContext>,
    ptr: i32,
    len: i32,
) -> Option<String> {
    if ptr < 0 || len < 0 {
        return None;
    }

    let memory = caller.get_export("memory")?.into_memory()?;
    let data = memory.data(caller);
    let start = usize::try_from(ptr).ok()?;
    let length = usize::try_from(len).ok()?;
    let end = start.checked_add(length)?;
    let bytes = data.get(start..end)?;

    std::str::from_utf8(bytes).ok().map(ToOwned::to_owned)
}

fn validate_import_permissions(
    module: &Module,
    permissions: &PluginPermissions,
) -> Result<(), PluginError> {
    for import in module.imports() {
        if import.module() != "openmail" {
            continue;
        }

        let Some(ExternType::Func(_)) = Some(import.ty()) else {
            continue;
        };

        let allowed = match import.name() {
            "log" | "emit_event" | "get_config_len" | "get_payload_len" | "set_payload_json" => true,
            "db_query" => allows_database_read(permissions),
            "db_execute" => allows_database_write(permissions),
            "send_notification" => permissions.notifications,
            "http_request" => permissions.network,
            "read_file" | "write_file" => permissions.filesystem,
            _ => false,
        };

        if !allowed {
            return Err(PluginError::PermissionDenied(format!(
                "plugin requested import `openmail::{}` without the required manifest permission",
                import.name()
            )));
        }
    }

    Ok(())
}

fn allows_database_read(permissions: &PluginPermissions) -> bool {
    permissions.database.as_ref().is_some_and(|scopes| {
        scopes.iter().any(|scope| scope.starts_with("read:"))
    })
}

fn allows_database_write(permissions: &PluginPermissions) -> bool {
    permissions.database.as_ref().is_some_and(|scopes| {
        scopes.iter().any(|scope| scope.starts_with("write:"))
    })
}
