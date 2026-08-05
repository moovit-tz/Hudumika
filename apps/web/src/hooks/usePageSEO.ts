import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { claimSEO } from '../lib/seo.js';

/**
 * States this page's title, overriding the route-derived fallback.
 *
 * Only worth calling when the derived title would be wrong or too thin —
 * AutoSEO already gives every route a reasonable one, so a new page needs
 * nothing unless it wants to say something better.
 */
export function usePageSEO(title: string, description?: string) {
  const { pathname } = useLocation();
  useEffect(() => {
    claimSEO(pathname, title, description);
  }, [pathname, title, description]);
}
