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
import { defineFrontendPlugin } from '@/plugins/sdk';

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
- `preferences:section`

## Local workflow

1. Start from [plugins/template/README.md](/Users/leco/RustroverProjects/open-mail/plugins/template/README.md).
2. Point `frontend.entry` to your `ui/index.tsx`.
3. Open `Preferences -> Plugins`.
4. Install the local `plugin.json`.
5. Toggle the plugin and verify the target slot.

## Working example

There is a real example plugin in [plugins/examples/inbox-insights/plugin.json](/Users/leco/RustroverProjects/open-mail/plugins/examples/inbox-insights/plugin.json).
