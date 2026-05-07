import type {
  FrontendCommandHandler,
  FrontendHookHandler,
  FrontendPlugin,
  FrontendPluginManifest,
  FrontendPluginStatus,
  LoadedFrontendPlugin,
  RegisteredFrontendPlugin,
  SlotRegistration
} from './types';

const toDefaultConfig = (manifest: FrontendPluginManifest) =>
  Object.fromEntries(
    Object.entries(manifest.config?.fields ?? {}).map(([key, field]) => [key, field.default ?? null])
  );

class PluginManager {
  private commands = new Map<string, FrontendCommandHandler>();
  private configValues = new Map<string, Record<string, unknown>>();
  private hooks = new Map<string, Array<{ handler: FrontendHookHandler; pluginId: string }>>();
  private listeners = new Set<() => void>();
  private manifests = new Map<string, FrontendPluginManifest>();
  private plugins = new Map<string, LoadedFrontendPlugin>();
  private pluginStatuses = new Map<string, FrontendPluginStatus>();
  private revision = 0;
  private slots = new Map<string, SlotRegistration[]>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async installPlugin(manifest: FrontendPluginManifest): Promise<void> {
    this.manifests.set(manifest.plugin.id, manifest);
    this.pluginStatuses.set(manifest.plugin.id, {
      errorMessage: null,
      state: 'disabled'
    });
    if (!this.configValues.has(manifest.plugin.id)) {
      this.configValues.set(manifest.plugin.id, toDefaultConfig(manifest));
    }

    await this.enablePlugin(manifest.plugin.id);
  }

  async loadPlugin(manifest: FrontendPluginManifest): Promise<void> {
    this.manifests.set(manifest.plugin.id, manifest);
    this.pluginStatuses.set(manifest.plugin.id, {
      errorMessage: null,
      state: 'disabled'
    });

    if (!manifest.frontend) {
      if (!this.configValues.has(manifest.plugin.id)) {
        this.configValues.set(manifest.plugin.id, toDefaultConfig(manifest));
      }
      this.pluginStatuses.set(manifest.plugin.id, {
        errorMessage: null,
        state: 'enabled'
      });
      this.emitChange();
      return;
    }

    if (this.plugins.has(manifest.plugin.id)) {
      await this.unloadPlugin(manifest.plugin.id);
    }

    let module: FrontendPlugin | null = null;
    const config = this.configValues.get(manifest.plugin.id) ?? toDefaultConfig(manifest);
    this.configValues.set(manifest.plugin.id, config);
    const commandNames: string[] = [];
    const hookRegistrations: Array<{ handler: FrontendHookHandler; name: string }> = [];
    const slotRegistrations: Array<{ slotName: string; registration: SlotRegistration }> = [];

    try {
      module = (await import(/* @vite-ignore */ manifest.frontend.entry)).default as FrontendPlugin;

      for (const slot of manifest.frontend.slots) {
        const component = module.components[slot.component];
        if (!component) {
          throw new Error(`Plugin component "${slot.component}" was not exported by ${manifest.plugin.id}`);
        }

        const registration = {
          pluginId: manifest.plugin.id,
          component
        };
        const registrations = this.slots.get(slot.name) ?? [];
        registrations.push(registration);
        this.slots.set(slot.name, registrations);
        slotRegistrations.push({ slotName: slot.name, registration });
      }

      if (module.activate) {
        await module.activate({
          getConfig: (key) => this.getPluginConfig(manifest.plugin.id)[key],
          registerCommand: (name, handler) => {
            const commandKey = `${manifest.plugin.id}:${name}`;
            this.commands.set(commandKey, handler);
            commandNames.push(commandKey);
          },
          registerHook: (name, handler) => {
            const handlers = this.hooks.get(name) ?? [];
            handlers.push({
              handler,
              pluginId: manifest.plugin.id
            });
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
      this.pluginStatuses.set(manifest.plugin.id, {
        errorMessage: null,
        state: 'enabled'
      });
      this.emitChange();
    } catch (error) {
      for (const commandName of commandNames) {
        this.commands.delete(commandName);
      }

      for (const hookRegistration of hookRegistrations) {
        const handlers = this.hooks.get(hookRegistration.name) ?? [];
        const remainingHandlers = handlers.filter((handler) => handler.handler !== hookRegistration.handler);
        if (remainingHandlers.length) {
          this.hooks.set(hookRegistration.name, remainingHandlers);
        } else {
          this.hooks.delete(hookRegistration.name);
        }
      }

      for (const { slotName, registration } of slotRegistrations) {
        const registrations = (this.slots.get(slotName) ?? []).filter((entry) => entry !== registration);
        if (registrations.length) {
          this.slots.set(slotName, registrations);
        } else {
          this.slots.delete(slotName);
        }
      }

      this.plugins.delete(manifest.plugin.id);
      this.pluginStatuses.set(manifest.plugin.id, {
        errorMessage: error instanceof Error ? error.message : 'Plugin failed to load',
        state: 'error'
      });
      this.emitChange();
      throw error;
    }
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin "${pluginId}" is not registered`);
    }

    await this.loadPlugin(manifest);
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      if (this.manifests.has(pluginId)) {
        this.pluginStatuses.set(pluginId, {
          errorMessage: null,
          state: 'disabled'
        });
        this.emitChange();
      }
      return;
    }

    let deactivateError: unknown = null;
    if (plugin.module.deactivate) {
      try {
        await plugin.module.deactivate();
      } catch (error) {
        deactivateError = error;
      }
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
      const remainingHandlers = handlers.filter((handler) => handler.handler !== registration.handler);
      if (remainingHandlers.length) {
        this.hooks.set(registration.name, remainingHandlers);
      } else {
        this.hooks.delete(registration.name);
      }
    }

    this.plugins.delete(pluginId);
    this.pluginStatuses.set(pluginId, {
      errorMessage:
        deactivateError instanceof Error
          ? deactivateError.message
          : deactivateError
            ? 'Plugin failed to deactivate'
            : null,
      state: deactivateError ? 'error' : 'disabled'
    });
    this.emitChange();

    if (deactivateError) {
      throw deactivateError;
    }
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.unloadPlugin(pluginId);
    this.manifests.delete(pluginId);
    this.configValues.delete(pluginId);
    this.pluginStatuses.delete(pluginId);
    this.emitChange();
  }

  getSlotComponents(slotName: string) {
    return (this.slots.get(slotName) ?? []).map((registration) => registration.component);
  }

  listPlugins(): RegisteredFrontendPlugin[] {
    return Array.from(this.manifests.values())
      .map((manifest) => ({
        config: this.getPluginConfig(manifest.plugin.id),
        enabled: this.plugins.has(manifest.plugin.id),
        errorMessage: this.pluginStatuses.get(manifest.plugin.id)?.errorMessage ?? null,
        manifest,
        state: this.pluginStatuses.get(manifest.plugin.id)?.state ?? 'disabled'
      }))
      .sort((left, right) => left.manifest.plugin.name.localeCompare(right.manifest.plugin.name));
  }

  getRevision() {
    return this.revision;
  }

  getPluginConfig(pluginId: string) {
    return this.configValues.get(pluginId) ?? this.plugins.get(pluginId)?.config ?? {};
  }

  updatePluginConfig(pluginId: string, key: string, value: unknown) {
    const currentConfig = this.getPluginConfig(pluginId);
    const nextConfig = {
      ...currentConfig,
      [key]: value
    };

    this.configValues.set(pluginId, nextConfig);

    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.config = nextConfig;
    }

    this.emitChange();
  }

  async executeCommand(commandName: string, args: unknown) {
    const handler = this.commands.get(commandName);
    if (!handler) {
      throw new Error(`Plugin command "${commandName}" is not registered`);
    }

    return handler(args);
  }

  async runHooks(hookName: string, payload: unknown) {
    const handlers = [...(this.hooks.get(hookName) ?? [])].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId)
    );
    const results: unknown[] = [];

    for (const registration of handlers) {
      try {
        results.push(await registration.handler(payload));
      } catch {
        continue;
      }
    }

    return results;
  }

  async runTransformHooks<T>(hookName: string, payload: T): Promise<T> {
    const handlers = [...(this.hooks.get(hookName) ?? [])].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId)
    );
    let currentPayload = payload;

    for (const registration of handlers) {
      try {
        const nextPayload = await registration.handler(currentPayload);
        if (nextPayload !== undefined) {
          currentPayload = nextPayload as T;
        }
      } catch {
        continue;
      }
    }

    return currentPayload;
  }

  reset() {
    this.commands.clear();
    this.configValues.clear();
    this.hooks.clear();
    this.manifests.clear();
    this.plugins.clear();
    this.pluginStatuses.clear();
    this.slots.clear();
    this.emitChange();
  }

  private emitChange() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }
}

export const pluginManager = new PluginManager();
