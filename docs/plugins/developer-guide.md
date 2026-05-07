# Open Mail Plugin Guide

## Frontend plugin shape

Open Mail frontend plugins currently use a `plugin.json` manifest plus a UI entry file.

```json
{
  "plugin": {
    "id": "com.openmail.plugin.example",
    "name": "Example Plugin",
    "version": "1.0.0"
  },
  "frontend": {
    "entry": "./ui/index.tsx",
    "slots": [{ "name": "status-bar:right", "component": "ExampleBadge" }]
  }
}
```

## Minimal module

```tsx
import { defineFrontendPlugin } from '@openmail/plugin-sdk';

const ExampleBadge = () => <span>Example plugin</span>;

export default defineFrontendPlugin({
  components: {
    ExampleBadge
  }
});
```

## Available frontend capabilities

- Slot registration through `components`
- Commands through `registerCommand`
- Hooks through `registerHook`
- Schema-driven config through `getConfig`

## Current slots in the app

- `status-bar:left`
- `status-bar:right`
- `sidebar:header`
- `sidebar:after-compose`
- `sidebar:after-system-folders`
- `sidebar:footer`
- `thread-list:header`
- `thread-list:footer`
- `thread-list:dialog-footer`
- `reader:header`
- `reader:footer`
- `onboarding:header`
- `onboarding:footer`
- `preferences:section`

## Backend plugin SDK

There is now a local Rust crate at [plugins/sdk/backend/openmail-plugin-sdk/Cargo.toml](/Users/leco/RustroverProjects/open-mail/plugins/sdk/backend/openmail-plugin-sdk/Cargo.toml) that exposes:

- hook name constants
- export name helpers for `hook_*` and `command_*`
- JSON payload helpers for plugin-side serialization

The starter backend crate lives at [plugins/template/backend/Cargo.toml](/Users/leco/RustroverProjects/open-mail/plugins/template/backend/Cargo.toml).

## Local workflow

1. Start from [plugins/template/README.md](/Users/leco/RustroverProjects/open-mail/plugins/template/README.md).
2. Point `frontend.entry` to your `ui/index.tsx`.
3. Import `defineFrontendPlugin` from `@openmail/plugin-sdk`.
4. If you need backend logic, use the backend crate template and compile it to WASM.
5. Open `Preferences -> Plugins`.
6. Install the local `plugin.json`.
7. Toggle the plugin and verify the target slot.

## Working example

There is a real example plugin in [plugins/examples/inbox-insights/plugin.json](/Users/leco/RustroverProjects/open-mail/plugins/examples/inbox-insights/plugin.json).
