import { ShellFrame } from '@components/layout/ShellFrame';
import { useBackendHealth } from '@hooks/useBackendHealth';

const App = () => {
  const { data, isLoading, isError } = useBackendHealth();

  return (
    <ShellFrame
      backendStatus={
        isLoading ? 'Conectando ao backend Tauri...' : isError ? 'Modo web ativo' : data ?? 'Backend pronto'
      }
    />
  );
};

export default App;

