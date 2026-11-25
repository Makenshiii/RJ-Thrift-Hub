import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const NetworkStatusContext = createContext(null);

export function NetworkStatusProvider({ children }) {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  const value = useMemo(() => ({ online }), [online]);
  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);
  if (!context) throw new Error('useNetworkStatus must be used inside NetworkStatusProvider.');
  return context;
}
