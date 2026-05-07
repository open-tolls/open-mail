export type {
  FrontendCommandHandler,
  FrontendHookHandler,
  FrontendPlugin,
  FrontendPluginConfigField,
  FrontendPluginContext,
  FrontendPluginManifest
} from './types';

import type { FrontendPlugin } from './types';

export const defineFrontendPlugin = <T extends FrontendPlugin>(plugin: T) => plugin;
