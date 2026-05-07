import type { ComponentType } from 'react';

export type FrontendPluginConfigField = {
  description?: string;
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
  permissions?: {
    commands?: string[];
    database?: string[];
    filesystem?: boolean;
    network?: boolean;
    notifications?: boolean;
  };
  plugin: {
    description?: string;
    id: string;
    name: string;
    version: string;
  };
};

export type FrontendCommandHandler = (args: unknown) => unknown | Promise<unknown>;
export type FrontendHookHandler = (payload: unknown) => unknown | Promise<unknown>;

export type FrontendPluginContext = {
  getConfig: (key: string) => unknown;
  registerCommand: (name: string, handler: FrontendCommandHandler) => void;
  registerHook: (name: string, handler: FrontendHookHandler) => void;
};

export type FrontendPlugin = {
  activate?: (context: FrontendPluginContext) => void | Promise<void>;
  components: Record<string, ComponentType<Record<string, unknown>>>;
  deactivate?: () => void | Promise<void>;
};

export const defineFrontendPlugin = <T extends FrontendPlugin>(plugin: T) => plugin;
