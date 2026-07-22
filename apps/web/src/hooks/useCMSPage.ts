import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { CmsPage } from '@hudumika/types';

/** Fetches a published Hudumika platform page (Privacy, Terms, ...) by slug — public, no auth. */
export function useCMSPage(slug: string) {
  const [page, setPage]       = useState<CmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/cms/platform-pages/${slug}`)
      .then(result => { setPage(result); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return { page, loading, error };
}
