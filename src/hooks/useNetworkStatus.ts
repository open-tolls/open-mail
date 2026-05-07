import { useEffect, useState } from 'react';

const readOnlineState = () =>
  typeof navigator === 'undefined' ? true : navigator.onLine;

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(readOnlineState);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOffline: !isOnline,
    isOnline
  };
};
