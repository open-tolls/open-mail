# Open Mail Plugin Template

1. Copy this folder to a new plugin directory.
2. Update `plugin.json` metadata and permissions.
3. Replace `ui/index.tsx` with your components and plugin logic.
4. If you also need backend logic, start from `backend/` and compile your crate to WASM.
5. Load the resulting `plugin.json` from Preferences → Plugins.

Current template scope:

- Frontend plugin wired to `@openmail/plugin-sdk`
- Optional backend crate template wired to `openmail-plugin-sdk`
- Schema-driven config
- Status bar slot example

Current limitations:

- No zip bundle format yet
- Backend host APIs still evolve with the runtime
