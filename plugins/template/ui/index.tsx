import { defineFrontendPlugin } from '@openmail/plugin-sdk';

const MyPluginStatus = ({
  activeFolderName,
  config
}: {
  activeFolderName?: string;
  config?: Record<string, unknown>;
}) => (
  <span>
    {String(config?.message ?? 'Hello from my plugin')} · {activeFolderName ?? 'Mailbox'}
  </span>
);

const MyPlugin = defineFrontendPlugin({
  components: {
    MyPluginStatus
  }
});

export default MyPlugin;
