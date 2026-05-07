# `openmail-plugin-sdk`

Crate backend local do Open Mail para plugins WASM.

## O que ela resolve hoje

- Constantes dos hooks principais
- Helpers para nomes de exports (`hook_*`, `command_*`)
- Helpers de serialização JSON para payloads

## Exemplo rápido

```rust
use openmail_plugin_sdk::{hook_export_name, HOOK_ON_MESSAGE_SENDING};

fn main() {
    assert_eq!(
        hook_export_name(HOOK_ON_MESSAGE_SENDING),
        "hook_on_message_sending"
    );
}
```

## Observação

O runtime atual do app continua executando plugins WASM pelo host Rust do Open Mail. Esta crate organiza o contrato para autores de plugin e serve como base para publicação futura.
