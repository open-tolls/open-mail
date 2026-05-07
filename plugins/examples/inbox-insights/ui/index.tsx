import { defineFrontendPlugin } from '@openmail/plugin-sdk';

const InboxInsightsBadge = ({
  totalUnreadCount
}: {
  totalUnreadCount?: number;
}) => <span>{totalUnreadCount ?? 0} unread tracked</span>;

const InboxInsightsPreferences = ({
  config
}: {
  config?: Record<string, unknown>;
}) => (
  <section className="preferences-section" aria-label="Inbox insights plugin section">
    <h2>Inbox insights</h2>
    <p>Status label: {String(config?.label ?? 'Focus')}</p>
    <p>Unread badge: {config?.showUnreadBadge === false ? 'Disabled' : 'Enabled'}</p>
  </section>
);

const InboxInsightsPlugin = defineFrontendPlugin({
  activate: ({ registerHook }) => {
    registerHook('status:collect', async (payload: unknown) => payload);
  },
  components: {
    InboxInsightsBadge,
    InboxInsightsPreferences
  }
});

export default InboxInsightsPlugin;
