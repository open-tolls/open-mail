use openmail_plugin_sdk::{command_export_name, hook_export_name, HOOK_ON_MESSAGE_SENDING};

#[unsafe(no_mangle)]
pub extern "C" fn init() -> i32 {
    0
}

#[unsafe(no_mangle)]
pub extern "C" fn hook_on_message_sending() -> i32 {
    let _ = hook_export_name(HOOK_ON_MESSAGE_SENDING);
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn command_probe_template() -> i32 {
    let _ = command_export_name("probe_template");
    1
}
