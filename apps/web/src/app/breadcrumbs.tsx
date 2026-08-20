import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbContextValue {
  trail: Crumb[];
  setTrail: (items: Crumb[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  trail: [],
  setTrail: () => {},
});

/** Holds the page-supplied dynamic segment(s) of the breadcrumb strip. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  const value = useMemo(() => ({ trail, setTrail }), [trail]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbTrail(): Crumb[] {
  return useContext(BreadcrumbContext).trail;
}

/**
 * For pages whose logical parent isn't in the URL — e.g. an activity's
 * programme. The items render as extra clickable crumbs before the current
 * page's own crumb, and clear automatically on unmount.
 */
export function useDynamicCrumbs(items: Crumb[] | null): void {
  const { setTrail } = useContext(BreadcrumbContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    if (items) setTrail(items);
    return () => setTrail([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
