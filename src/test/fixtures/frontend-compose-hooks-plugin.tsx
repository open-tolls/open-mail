import type { FrontendPluginContext } from '@/plugins/types';

export default {
  activate: ({ getConfig, registerHook }: FrontendPluginContext) => {
    registerHook('compose:transform-body', async (payload: unknown) => {
      if (getConfig('throw_on_transform') === true) {
        throw new Error('transform hook failed');
      }

      if (typeof payload !== 'string') {
        return payload;
      }

      const appendHtml = String(getConfig('append_html') ?? '');
      return appendHtml ? `${payload}${appendHtml}` : payload;
    });

    registerHook('compose:before-send', async (payload: unknown) => {
      if (getConfig('throw_on_before_send') === true) {
        throw new Error('before-send hook failed');
      }

      if (getConfig('block_send') === true) {
        return {
          allow: false,
          message: String(getConfig('block_message') ?? 'Send blocked by plugin')
        };
      }

      const htmlBody =
        typeof payload === 'object' && payload !== null && 'htmlBody' in payload && typeof payload.htmlBody === 'string'
          ? payload.htmlBody
          : null;

      return {
        allow: true,
        htmlBody,
        pluginLabel: String(getConfig('plugin_label') ?? '')
      };
    });
  },
  components: {}
};
