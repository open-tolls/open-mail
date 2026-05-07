import type { FrontendPluginContext } from '@/plugins/types';

export default {
  activate: async (_context: FrontendPluginContext) => {
    void _context;
    throw new Error('Plugin activation failed');
  },
  components: {}
};
