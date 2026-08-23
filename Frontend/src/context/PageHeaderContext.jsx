import { createContext, useContext, useState, useMemo, useEffect } from 'react';

const PageHeaderContext = createContext(null);

export const PageHeaderProvider = ({ children }) => {
  const [header, setHeader] = useState({ title: '', subtitle: '', actions: null });
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hooks live alongside the provider by convention
export const usePageHeaderContext = () => {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error('usePageHeaderContext must be used within PageHeaderProvider');
  return ctx;
};

// Pages call this once to set the shared top-bar title/subtitle/actions. Only re-runs when the
// title/subtitle text changes (not on every render) — actions is still captured fresh via
// closure whenever it does run, which is sufficient for this app's mostly-static action buttons.
// eslint-disable-next-line react-refresh/only-export-components
export const usePageHeader = ({ title, subtitle, actions }) => {
  const { setHeader } = usePageHeaderContext();
  useEffect(() => {
    setHeader({ title, subtitle, actions });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `actions`, see comment above
  }, [title, subtitle]);
};
