import { ShellFrame } from '@components/layout/ShellFrame';
import { useBackendHealth } from '@hooks/useBackendHealth';
import { useMailboxOverview } from '@hooks/useMailboxOverview';

const App = () => {
  const { data, isLoading, isError } = useBackendHealth();
  const mailboxQuery = useMailboxOverview();

  return (
    <ShellFrame
      backendStatus={
        isLoading ? 'Conectando ao backend Tauri...' : isError ? 'Modo web ativo' : data ?? 'Backend pronto'
      }
      folders={mailboxQuery.data?.folders ?? []}
      threads={mailboxQuery.data?.threads ?? []}
    />
  );
};

export default App;
