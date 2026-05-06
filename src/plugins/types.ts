import type { ComponentType } from 'react';

export type FrontendPluginConfigField = {
  default?: unknown;
  label?: string;
  options?: string[];
  type: string;
};

export type FrontendPluginManifest = {
  config?: {
    fields: Record<string, FrontendPluginConfigField>;
  };
  frontend?: {
    entry: string;
    slots: Array<{
      component: string;
      name: string;
    }>;
  };
  plugin: {
    id: string;
    name: string;
    version: string;
  };
};

export type FrontendPluginContext = {
  getConfig: (key: string) => unknown;
  registerCommand: (name: string, handler: FrontendCommandHandler) => void;
  registerHook: (name: string, handler: FrontendHookHandler) => void;
};

export type FrontendCommandHandler = (args: unknown) => unknown | Promise<unknown>;
export type FrontendHookHandler = (payload: unknown) => unknown | Promise<unknown>;

export type FrontendPlugin = {
  activate?: (context: FrontendPluginContext) => void | Promise<void>;
  components: Record<string, ComponentType<Record<string, unknown>>>;
  deactivate?: () => void | Promise<void>;
};

export type LoadedFrontendPlugin = {
  commandNames: string[];
  config: Record<string, unknown>;
  hookRegistrations: Array<{
    handler: FrontendHookHandler;
    name: string;
  }>;
  manifest: FrontendPluginManifest;
  module: FrontendPlugin;
};

export type SlotRegistration = {
  component: ComponentType<Record<string, unknown>>;
  pluginId: string;
};
