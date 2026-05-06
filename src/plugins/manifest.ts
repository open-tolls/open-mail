import type { FrontendPluginManifest } from './types';

const normalizePathSeparators = (value: string) => value.replace(/\\/g, '/');

const dirname = (value: string) => {
  const normalized = normalizePathSeparators(value);
  const boundary = normalized.lastIndexOf('/');
  return boundary >= 0 ? normalized.slice(0, boundary) : '';
};

const resolveRelativePath = (basePath: string, relativePath: string) => {
  if (!relativePath.startsWith('.')) {
    return relativePath;
  }

  const normalizedBase = dirname(basePath);
  const segments = `${normalizedBase}/${relativePath}`.split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return `${basePath.startsWith('/') ? '/' : ''}${resolved.join('/')}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toOptionalStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

export const parseFrontendPluginManifest = (
  source: string,
  options?: { manifestPath?: string; toAssetUrl?: (filePath: string) => string }
): FrontendPluginManifest => {
  const parsed = JSON.parse(source) as unknown;

  if (!isRecord(parsed) || !isRecord(parsed.plugin)) {
    throw new Error('Invalid plugin manifest');
  }

  const plugin = parsed.plugin;

  if (typeof plugin.id !== 'string' || typeof plugin.name !== 'string' || typeof plugin.version !== 'string') {
    throw new Error('Plugin manifest is missing required plugin metadata');
  }

  const manifest: FrontendPluginManifest = {
    plugin: {
      description: typeof plugin.description === 'string' ? plugin.description : undefined,
      id: plugin.id,
      name: plugin.name,
      version: plugin.version
    }
  };

  if (isRecord(parsed.permissions)) {
    manifest.permissions = {
      commands: toOptionalStringArray(parsed.permissions.commands),
      database: toOptionalStringArray(parsed.permissions.database),
      filesystem: parsed.permissions.filesystem === true,
      network: parsed.permissions.network === true,
      notifications: parsed.permissions.notifications === true
    };
  }

  if (isRecord(parsed.config) && isRecord(parsed.config.fields)) {
    manifest.config = {
      fields: Object.fromEntries(
        Object.entries(parsed.config.fields)
          .flatMap(([fieldKey, field]) => {
            if (!isRecord(field) || typeof field.type !== 'string') {
              return [];
            }

            return [
              [
                fieldKey,
                {
                  default: field.default,
                  description: typeof field.description === 'string' ? field.description : undefined,
                  label: typeof field.label === 'string' ? field.label : undefined,
                  options: toOptionalStringArray(field.options),
                  type: field.type
                }
              ]
            ];
          })
      )
    };
  }

  if (isRecord(parsed.frontend)) {
    if (typeof parsed.frontend.entry !== 'string' || !Array.isArray(parsed.frontend.slots)) {
      throw new Error('Plugin manifest frontend block is invalid');
    }

    const resolvedEntry =
      options?.manifestPath && parsed.frontend.entry.startsWith('.')
        ? resolveRelativePath(options.manifestPath, parsed.frontend.entry)
        : parsed.frontend.entry;

    manifest.frontend = {
      entry: options?.toAssetUrl && resolvedEntry.startsWith('/') ? options.toAssetUrl(resolvedEntry) : resolvedEntry,
      slots: parsed.frontend.slots
        .filter(
          (slot): slot is { component: string; name: string } =>
            isRecord(slot) && typeof slot.component === 'string' && typeof slot.name === 'string'
        )
        .map((slot) => ({
          component: slot.component,
          name: slot.name
        }))
    };
  }

  return manifest;
};
