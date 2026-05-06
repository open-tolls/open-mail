import type {
  FrontendCommandHandler,
  FrontendHookHandler,
  FrontendPlugin,
  FrontendPluginManifest,
  LoadedFrontendPlugin,
  SlotRegistration
} from './types';

const toDefaultConfig = (manifest: FrontendPluginManifest) =>
  Object.fromEntries(
    Object.entries(manifest.config?.fields ?? {}).map(([key, field]) => [key, field.default ?? null])
  );

class PluginManager {
  private commands = new Map<string, FrontendCommandHandler>();
  private hooks = new Map<string, FrontendHookHandler[]>();
  private listeners = new Set<() => void>();
  private plugins = new Map<string, LoadedFrontendPlugin>();
  private revision = 0;
  private slots = new Map<string, SlotRegistration[]>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async loadPlugin(manifest: FrontendPluginManifest): Promise<void> {
    if (!manifest.frontend) {
      return;
    }

    if (this.plugins.has(manifest.plugin.id)) {
      await this.unloadPlugin(manifest.plugin.id);
    }

    const module = (await import(/* @vite-ignore */ manifest.frontend.entry)).default as FrontendPlugin;
    const config = toDefaultConfig(manifest);
    const commandNames: string[] = [];
    const hookRegistrations: Array<{ handler: FrontendHookHandler; name: string }> = [];

    for (const slot of manifest.frontend.slots) {
      const component = module.components[slot.component];
      if (!component) {
        throw new Error(`Plugin component "${slot.component}" was not exported by ${manifest.plugin.id}`);
      }

      const registrations = this.slots.get(slot.name) ?? [];
      registrations.push({
        pluginId: manifest.plugin.id,
        component
      });
      this.slots.set(slot.name, registrations);
    }

    if (module.activate) {
      await module.activate({
        getConfig: (key) => config[key],
        registerCommand: (name, handler) => {
          const commandKey = `${manifest.plugin.id}:${name}`;
          this.commands.set(commandKey, handler);
          commandNames.push(commandKey);
        },
        registerHook: (name, handler) => {
          const handlers = this.hooks.get(name) ?? [];
          handlers.push(handler);
          this.hooks.set(name, handlers);
          hookRegistrations.push({ handler, name });
        }
      });
    }

    this.plugins.set(manifest.plugin.id, {
      commandNames,
      config,
      hookRegistrations,
      manifest,
      module
    });
    this.emitChange();
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    if (plugin.module.deactivate) {
      await plugin.module.deactivate();
    }

    for (const slotName of this.slots.keys()) {
      const next = (this.slots.get(slotName) ?? []).filter((registration) => registration.pluginId !== pluginId);
      if (next.length) {
        this.slots.set(slotName, next);
      } else {
        this.slots.delete(slotName);
      }
    }

    for (const commandName of plugin.commandNames) {
      this.commands.delete(commandName);
    }

    for (const registration of plugin.hookRegistrations) {
      const handlers = this.hooks.get(registration.name) ?? [];
      const remainingHandlers = handlers.filter((handler) => handler !== registration.handler);
      if (remainingHandlers.length) {
        this.hooks.set(registration.name, remainingHandlers);
      } else {
        this.hooks.delete(registration.name);
      }
    }

    this.plugins.delete(pluginId);
    this.emitChange();
  }

  getSlotComponents(slotName: string) {
    return (this.slots.get(slotName) ?? []).map((registration) => registration.component);
  }

  getRevision() {
    return this.revision;
  }

  getPluginConfig(pluginId: string) {
    return this.plugins.get(pluginId)?.config ?? {};
  }

  async executeCommand(commandName: string, args: unknown) {
    const handler = this.commands.get(commandName);
    if (!handler) {
      throw new Error(`Plugin command "${commandName}" is not registered`);
    }

    return handler(args);
  }

  async runHooks(hookName: string, payload: unknown) {
    const handlers = this.hooks.get(hookName) ?? [];
    return Promise.all(handlers.map((handler) => handler(payload)));
  }

  reset() {
    this.commands.clear();
    this.hooks.clear();
    this.plugins.clear();
    this.slots.clear();
    this.emitChange();
  }

  private emitChange() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }
}

export const pluginManager = new PluginManager();
