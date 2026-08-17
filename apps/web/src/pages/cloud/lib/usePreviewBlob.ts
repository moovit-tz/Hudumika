import { useEffect, useState } from 'react';
import { apiFetchBlob } from '../../../lib/api.js';

/**
 * Fetches a file's real bytes through the authenticated GET /:id/preview
 * route (inline Content-Disposition) and turns them into an object URL an
 * <img>/<iframe>/<video> can point at directly. A plain <img src="/v1/
 * files/:id/preview"> can't carry the Authorization header an authenticated
 * route needs — this is the same fetch-then-blob-URL pattern apiDownload()
 * already uses, just without the synthetic <a>/.click().
 */
export function usePreviewBlob(fileId: string | null): { url: string | null; loading: boolean; error: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!fileId) { setUrl(null); return; }
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    apiFetchBlob(`/v1/files/${fileId}/preview`)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  return { url, loading, error };
}
