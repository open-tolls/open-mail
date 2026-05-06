import { describe, expect, it } from 'vitest';
import { parseFrontendPluginManifest } from '@/plugins/manifest';

describe('parseFrontendPluginManifest', () => {
  it('parses plugin.json metadata and resolves a relative frontend entry path', () => {
    const manifest = parseFrontendPluginManifest(
      JSON.stringify({
        config: {
          fields: {
            digest_hour: {
              default: '08:00',
              label: 'Digest hour',
              type: 'time'
            }
          }
        },
        frontend: {
          entry: './dist/plugin-entry.js',
          slots: [{ component: 'StatusRight', name: 'status-bar:right' }]
        },
        permissions: {
          filesystem: true,
          notifications: true
        },
        plugin: {
          description: 'Fixture plugin manifest',
          id: 'com.openmail.plugin.fixture-manifest',
          name: 'Fixture Manifest',
          version: '1.0.0'
        }
      }),
      {
        manifestPath: '/plugins/fixture/plugin.json',
        toAssetUrl: (filePath) => `asset://${filePath}`
      }
    );

    expect(manifest).toEqual({
      config: {
        fields: {
          digest_hour: {
            default: '08:00',
            label: 'Digest hour',
            options: undefined,
            type: 'time'
          }
        }
      },
      frontend: {
        entry: 'asset:///plugins/fixture/dist/plugin-entry.js',
        slots: [{ component: 'StatusRight', name: 'status-bar:right' }]
      },
      permissions: {
        commands: undefined,
        database: undefined,
        filesystem: true,
        network: false,
        notifications: true
      },
      plugin: {
        description: 'Fixture plugin manifest',
        id: 'com.openmail.plugin.fixture-manifest',
        name: 'Fixture Manifest',
        version: '1.0.0'
      }
    });
  });

  it('rejects manifests without required plugin metadata', () => {
    expect(() =>
      parseFrontendPluginManifest(
        JSON.stringify({
          plugin: {
            id: 'com.openmail.plugin.invalid'
          }
        })
      )
    ).toThrow('Plugin manifest is missing required plugin metadata');
  });
});
