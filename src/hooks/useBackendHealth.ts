import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const fetchHealth = async () => {
  if (!isTauriRuntimeAvailable()) {
    return 'Open Mail frontend running';
  }

  return invoke<string>('health_check');
};

export const useBackendHealth = () =>
  useQuery({
    queryKey: ['backend-health'],
    queryFn: fetchHealth
  });

